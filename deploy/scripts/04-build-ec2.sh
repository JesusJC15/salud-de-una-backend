#!/bin/bash
# ============================================================
# SCRIPT 04 — Construir imágenes Docker con un EC2 temporal
#
# CodeBuild está bloqueado en AWS Academy.
# Este script lanza un t2.micro que: clona los repos (públicos),
# construye las imágenes, las sube a ECR y se auto-termina.
# ============================================================
set -euo pipefail

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
OUTPUTS_FILE="$HOME/.salud-de-una-tf-outputs.json"
export PATH="$HOME/.local/bin:$PATH"

echo "======================================================"
echo " SaludDeUna — Build con EC2 temporal"
echo "======================================================"

# ── Leer outputs de Terraform ─────────────────────────────
if [[ ! -f "$OUTPUTS_FILE" ]]; then
  echo "ERROR: No encuentro $OUTPUTS_FILE. Ejecuta primero: bash scripts/02-infra.sh"
  exit 1
fi

ALB_DNS=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['alb_dns_name']['value'])")
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Leer VPC y subnet desde el state de terraform para lanzar el EC2 en nuestra VPC
cd "$(dirname "$0")/../terraform"
VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || \
  aws ec2 describe-vpcs --filters "Name=tag:Project,Values=salud-de-una" \
    --query 'Vpcs[0].VpcId' --output text --region "$REGION")
SUBNET_ID=$(terraform output -raw subnet_public_a_id 2>/dev/null || \
  aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=true" \
    --query 'Subnets[0].SubnetId' --output text --region "$REGION")
cd - > /dev/null

echo ""
echo "VPC:    $VPC_ID"
echo "Subnet: $SUBNET_ID"
echo "ALB:    $ALB_DNS"
echo "ECR:    $ECR_BASE"
echo ""

# ── Obtener la AMI más reciente de Amazon Linux 2023 ─────
echo ">>> Buscando AMI de Amazon Linux 2023..."
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=al2023-ami-2023*" \
    "Name=architecture,Values=x86_64" \
    "Name=state,Values=available" \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" \
  --output text \
  --region "$REGION")
echo "    AMI: $AMI_ID"

# ── Crear Security Group temporal para el EC2 builder ────
echo ""
echo ">>> Creando security group temporal..."
SG_ID=$(aws ec2 create-security-group \
  --group-name "salud-de-una-builder-$(date +%s)" \
  --description "Temporal: build Docker images" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' \
  --output text \
  --region "$REGION")

# Solo egress (el builder no necesita ingress)
aws ec2 authorize-security-group-egress \
  --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' \
  --region "$REGION" 2>/dev/null || true

echo "    SG: $SG_ID"

# ── Script que se ejecuta en el EC2 al arrancar (user-data) ─
# Las variables del entorno de CloudShell se interpolan aquí (antes de enviar al EC2)
USER_DATA=$(cat <<USERDATA
#!/bin/bash
exec > >(tee /var/log/salud-build.log 2>&1) 2>&1
set -euo pipefail

echo "========================================"
echo " SaludDeUna — Docker Build en EC2"
echo " \$(date)"
echo "========================================"

# Obtener metadata del EC2
TOKEN=\$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_REGION=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
INSTANCE_ID=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

echo "Región:   \$EC2_REGION"
echo "Instancia: \$INSTANCE_ID"

# Instalar Docker
echo ""
echo ">>> Instalando Docker..."
dnf install -y docker git
systemctl start docker
systemctl enable docker

# Login a ECR
echo ""
echo ">>> Login a ECR..."
aws ecr get-login-password --region \$EC2_REGION | \
  docker login --username AWS --password-stdin ${ECR_BASE}

# ── Build Backend ────────────────────────────────────────
echo ""
echo ">>> Clonando backend..."
git clone --depth 1 https://github.com/JesusJC15/salud-de-una-backend /tmp/backend
echo ">>> Construyendo imagen backend (puede tardar 5-8 min)..."
docker build \
  --target runner \
  -t ${ECR_BASE}/salud-de-una/backend:latest \
  /tmp/backend
echo ">>> Subiendo imagen backend a ECR..."
docker push ${ECR_BASE}/salud-de-una/backend:latest
echo "BACKEND_BUILD_OK"

# ── Build Web ─────────────────────────────────────────────
echo ""
echo ">>> Clonando web..."
git clone --depth 1 https://github.com/JesusJC15/salud-de-una-web /tmp/web
echo ">>> Construyendo imagen web (puede tardar 10-15 min)..."
docker build \
  --target runner \
  --build-arg NEXT_OUTPUT=standalone \
  --build-arg "NEXT_PUBLIC_API_BASE_URL=http://${ALB_DNS}/v1" \
  --build-arg "NEXT_PUBLIC_AUTH0_DOMAIN=salud-de-una.us.auth0.com" \
  --build-arg "NEXT_PUBLIC_AUTH0_CLIENT_ID=3NN7oWXQ8cm42AI8nsASi39rbHmbi1cR" \
  --build-arg "NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.salud-de-una.com" \
  --build-arg "NEXT_PUBLIC_AUTH0_REDIRECT_URI=http://${ALB_DNS}/callback" \
  -t ${ECR_BASE}/salud-de-una/web:latest \
  /tmp/web
echo ">>> Subiendo imagen web a ECR..."
docker push ${ECR_BASE}/salud-de-una/web:latest
echo "WEB_BUILD_OK"

# ── Forzar redeploy en ECS ──────────────────────────────
echo ""
echo ">>> Forzando redeploy en ECS..."
for SVC in salud-de-una-dev-backend-api salud-de-una-dev-backend-worker salud-de-una-dev-web; do
  aws ecs update-service \
    --cluster salud-de-una-dev \
    --service \$SVC \
    --force-new-deployment \
    --region \$EC2_REGION \
    --no-cli-pager > /dev/null
  echo "  Redeployado: \$SVC"
done

echo ""
echo "========================================"
echo " BUILD COMPLETADO - \$(date)"
echo " Terminando instancia en 10s..."
echo "========================================"
echo "ALL_DONE"

sleep 10
aws ec2 terminate-instances --instance-ids \$INSTANCE_ID --region \$EC2_REGION > /dev/null
USERDATA
)

# ── Lanzar instancia EC2 ──────────────────────────────────
echo ""
echo ">>> Lanzando instancia EC2 t2.micro..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "t2.micro" \
  --iam-instance-profile Name=LabInstanceProfile \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=salud-de-una-builder},{Key=Project,Value=salud-de-una}]" \
  --query 'Instances[0].InstanceId' \
  --output text \
  --region "$REGION")

echo "    Instancia lanzada: $INSTANCE_ID"
echo ""
echo ">>> Esperando que la instancia arranque..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "    Instancia corriendo."
echo ""
echo "========================================================"
echo " Monitoreando el build (actualiza cada 30s)..."
echo " El build completo tarda ~20-25 minutos."
echo " Puedes ir a AWS Console → EC2 → Instances para verla."
echo "========================================================"
echo ""

# ── Monitorear via console output ────────────────────────
LAST_SEEN=""
DONE=false
ELAPSED=0
MAX_WAIT=2400  # 40 minutos máximo

while [[ "$DONE" == "false" && $ELAPSED -lt $MAX_WAIT ]]; do
  sleep 30
  ELAPSED=$((ELAPSED + 30))

  # Obtener console output (base64-encoded)
  OUTPUT=$(aws ec2 get-console-output \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Output' \
    --output text 2>/dev/null | base64 --decode 2>/dev/null || echo "")

  if [[ -z "$OUTPUT" ]]; then
    echo "  [$(date '+%H:%M:%S')] Esperando output de consola... ($ELAPSED s)"
    continue
  fi

  # Mostrar solo líneas nuevas
  NEW_LINES=$(echo "$OUTPUT" | grep -F "$LAST_SEEN" -A 999999 2>/dev/null | tail -n +2 || echo "$OUTPUT")
  if [[ -n "$NEW_LINES" ]]; then
    echo "$NEW_LINES" | grep -E "(>>>|BACKEND_BUILD_OK|WEB_BUILD_OK|ALL_DONE|Error|error|FAILED|failed)" || true
    LAST_SEEN=$(echo "$OUTPUT" | tail -1)
  fi

  # Verificar si terminó
  if echo "$OUTPUT" | grep -q "ALL_DONE"; then
    DONE=true
  fi

  # Verificar si la instancia ya se terminó (build completo)
  INST_STATE=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text \
    --region "$REGION" 2>/dev/null || echo "unknown")

  if [[ "$INST_STATE" == "terminated" || "$INST_STATE" == "shutting-down" ]]; then
    DONE=true
  fi

  echo "  [$(date '+%H:%M:%S')] Estado instancia: $INST_STATE | Tiempo: ${ELAPSED}s"
done

# ── Limpiar SG temporal ───────────────────────────────────
echo ""
echo ">>> Limpiando security group temporal..."
aws ec2 delete-security-group --group-id "$SG_ID" --region "$REGION" 2>/dev/null || \
  echo "    (SG se limpiará cuando la instancia termine)"

echo ""
echo "========================================================"
if [[ "$DONE" == "true" ]]; then
  echo "✅ Build completado."
  echo ""
  echo "Las imágenes están en ECR y ECS ya está redesplegando."
  echo "Espera 3-5 minutos y verifica con:"
  echo ""
  echo "   bash scripts/06-verify.sh"
else
  echo "⚠️  Tiempo de espera agotado. Verifica manualmente:"
  echo "   AWS Console → EC2 → Instances → selecciona la instancia"
  echo "   → Actions → Monitor and troubleshoot → Get system log"
fi
