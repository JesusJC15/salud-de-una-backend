#!/bin/bash
# ============================================================
# SCRIPT 00 — Instalar Terraform en AWS CloudShell
# Ejecutar UNA SOLA VEZ por sesión de CloudShell
# ============================================================
set -euo pipefail

TERRAFORM_VERSION="1.9.8"
INSTALL_DIR="$HOME/.local/bin"

echo "======================================================"
echo " SaludDeUna — Setup de CloudShell"
echo "======================================================"

# Verificar que estamos en CloudShell / Linux
if [[ "$(uname)" != "Linux" ]]; then
  echo "ERROR: Este script es para AWS CloudShell (Linux)."
  exit 1
fi

# Verificar credenciales AWS activas
echo ""
echo ">>> Verificando credenciales AWS..."
IDENTITY=$(aws sts get-caller-identity --output json)
ACCOUNT_ID=$(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])")
USER_ARN=$(echo "$IDENTITY"  | python3 -c "import sys,json; print(json.load(sys.stdin)['Arn'])")
echo "    Account ID : $ACCOUNT_ID"
echo "    Usuario    : $USER_ARN"
echo "    Región     : $(aws configure get region || echo 'us-east-1')"

# Guardar Account ID para los demás scripts
echo "$ACCOUNT_ID" > "$HOME/.salud-de-una-account-id"
echo "us-east-1" > "$HOME/.salud-de-una-region"

# Crear directorio de binarios locales
mkdir -p "$INSTALL_DIR"

# Instalar Terraform si no está disponible
if terraform --version &>/dev/null; then
  echo ""
  echo ">>> Terraform ya instalado: $(terraform version | head -1)"
else
  echo ""
  echo ">>> Instalando Terraform ${TERRAFORM_VERSION}..."
  TF_URL="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
  curl -fsSL "$TF_URL" -o /tmp/terraform.zip
  unzip -q /tmp/terraform.zip -d "$INSTALL_DIR"
  rm /tmp/terraform.zip
  chmod +x "$INSTALL_DIR/terraform"
  echo "    Terraform instalado en $INSTALL_DIR/terraform"
fi

# Agregar al PATH si no está
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$HOME/.bashrc"
  export PATH="$HOME/.local/bin:$PATH"
fi

# Verificar jq (viene en CloudShell pero por si acaso)
if ! command -v jq &>/dev/null; then
  echo ">>> Instalando jq..."
  sudo dnf install -y jq 2>/dev/null || sudo yum install -y jq 2>/dev/null || true
fi

echo ""
echo "======================================================"
echo " Versiones instaladas:"
terraform version | head -1
aws --version
echo " jq: $(jq --version)"
echo "======================================================"
echo ""
echo "✅ Setup completo."
echo ""
echo "PRÓXIMO PASO:"
echo "   bash scripts/01-configure.sh"
