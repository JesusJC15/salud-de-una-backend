#!/bin/bash
# ============================================================
# SCRIPT 02 — Crear infraestructura AWS con Terraform
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
TF_DIR="$DEPLOY_DIR/terraform"

export PATH="$HOME/.local/bin:$PATH"

echo "======================================================"
echo " SaludDeUna — Crear infraestructura"
echo "======================================================"

# Verificar que terraform.tfvars existe
if [[ ! -f "$TF_DIR/terraform.tfvars" ]]; then
  echo "ERROR: No encontré terraform.tfvars. Ejecuta primero: bash scripts/01-configure.sh"
  exit 1
fi

cd "$TF_DIR"

echo ""
echo ">>> terraform init..."
terraform init -upgrade

echo ""
echo ">>> terraform plan..."
terraform plan -out=tfplan

echo ""
echo ">>> ¿Continuar con el apply? (s/N)"
read -rp "    Respuesta: " confirm
if [[ "${confirm,,}" != "s" ]]; then
  echo "Cancelado. El plan fue guardado en tfplan si quieres revisarlo."
  exit 0
fi

echo ""
echo ">>> terraform apply..."
terraform apply tfplan

echo ""
echo "======================================================"
echo "✅ Infraestructura creada."
echo ""

# Mostrar los outputs importantes
echo "--- Valores importantes (guárdalos) ---"
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
BACKEND_ECR=$(terraform output -raw backend_ecr_url 2>/dev/null || echo "")
WEB_ECR=$(terraform output -raw web_ecr_url 2>/dev/null || echo "")

echo "  ALB DNS      : $ALB_DNS"
echo "  Backend ECR  : $BACKEND_ECR"
echo "  Web ECR      : $WEB_ECR"
echo ""

# Guardar outputs para scripts siguientes
terraform output -json > "$HOME/.salud-de-una-tf-outputs.json"

echo "PRÓXIMO PASO:"
echo "   bash scripts/03-secrets.sh"
