#!/bin/bash
# ============================================================
# SCRIPT 03 — Llenar secrets en AWS SSM Parameter Store
# Los secrets NO se guardan en terraform.tfvars ni en código
# ============================================================
set -euo pipefail

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
PROJECT="salud-de-una"

echo "======================================================"
echo " SaludDeUna — Configurar secrets"
echo "======================================================"
echo ""
echo "Los valores se guardan en AWS SSM Parameter Store (cifrados)."
echo "Entrada en modo silencioso — no se muestra lo que escribes."
echo ""

# ── Función para llenar un parámetro SSM ─────────────────
put_secret() {
  local name=$1
  local description=$2
  local current

  current=$(aws ssm get-parameter \
    --name "/${PROJECT}/${name}" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text \
    --region "$REGION" 2>/dev/null || echo "")

  if [[ "$current" == "placeholder" || -z "$current" ]]; then
    read -rsp "  ${name} (${description}): " value
    echo ""
    if [[ -z "$value" ]]; then
      echo "    ⚠️  Saltado (vacío)"
      return
    fi
    aws ssm put-parameter \
      --name "/${PROJECT}/${name}" \
      --value "$value" \
      --type "SecureString" \
      --overwrite \
      --region "$REGION" \
      --no-cli-pager \
      --output text > /dev/null
    echo "    ✅ Guardado"
  else
    echo "  ${name} → ya tiene valor, saltando (usa --overwrite para cambiar)"
  fi
}

echo "--- Backend secrets ---"
echo ""
put_secret "MONGODB_URI" \
  "mongodb+srv://user:password@cluster.mongodb.net/salud-de-una?retryWrites=true"
echo ""
put_secret "JWT_SECRET" \
  "mínimo 32 caracteres — genera con: openssl rand -hex 32"
echo ""
put_secret "JWT_REFRESH_SECRET" \
  "mínimo 32 caracteres — genera con: openssl rand -hex 32"
echo ""
put_secret "REDIS_URL" \
  "rediss://user:password@host:port (Redis Cloud con TLS)"
echo ""
put_secret "GEMINI_API_KEY" \
  "clave de Google AI Studio (aistudio.google.com/apikey)"
echo ""
put_secret "AUTH0_M2M_CLIENT_SECRET" \
  "Auth0 Dashboard → Applications → M2M App → Settings → Client Secret"
echo ""
put_secret "GITHUB_TOKEN" \
  "GitHub PAT (repo scope) para que CodeBuild clone el repo"

echo ""
echo "======================================================"
echo "✅ Secrets configurados en SSM Parameter Store."
echo "   Puedes verificarlos en: AWS Console → SSM → Parameter Store → /${PROJECT}/"
echo ""
echo "PRÓXIMO PASO:"
echo "   bash scripts/04-build.sh"
