#!/bin/bash
# ============================================================
# SCRIPT 01 — Configurar variables del proyecto
# Genera el archivo deploy/terraform/terraform.tfvars
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
TFVARS_FILE="$DEPLOY_DIR/terraform/terraform.tfvars"

ACCOUNT_ID=$(cat "$HOME/.salud-de-una-account-id" 2>/dev/null || aws sts get-caller-identity --query Account --output text)
REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")

echo "======================================================"
echo " SaludDeUna — Configuración de variables"
echo "======================================================"
echo ""
echo "Voy a pedirte los valores de configuración."
echo "Pulsa ENTER para usar el valor por defecto [entre corchetes]."
echo ""

# ── Función auxiliar ──────────────────────────────────────
ask() {
  local var_name=$1
  local prompt=$2
  local default=$3
  local secret=${4:-false}

  if [[ "$secret" == "true" ]]; then
    read -rsp "  $prompt [$default]: " value
    echo ""
  else
    read -rp  "  $prompt [$default]: " value
  fi

  echo "${value:-$default}"
}

# ── GitHub ────────────────────────────────────────────────
echo "--- GitHub (repos separados) ---"
GITHUB_REPO_BACKEND=$(ask "GITHUB_REPO_BACKEND" "URL repo BACKEND" "https://github.com/JesusJC15/salud-de-una-backend")
GITHUB_REPO_WEB=$(ask "GITHUB_REPO_WEB" "URL repo WEB" "https://github.com/JesusJC15/salud-de-una-web")
GITHUB_BRANCH=$(ask "GITHUB_BRANCH" "Rama (misma en ambos repos)" "main")
echo ""

# ── Auth0 ─────────────────────────────────────────────────
echo "--- Auth0 (los valores de tu tenant actual) ---"
AUTH0_DOMAIN=$(ask "AUTH0_DOMAIN" "Auth0 Domain" "salud-de-una.us.auth0.com")
AUTH0_AUDIENCE=$(ask "AUTH0_AUDIENCE" "Auth0 Audience" "https://api.salud-de-una.com")
AUTH0_M2M_CLIENT_ID=$(ask "AUTH0_M2M_CLIENT_ID" "Auth0 M2M Client ID" "")
AUTH0_ROLE_ID_PATIENT=$(ask "AUTH0_ROLE_ID_PATIENT" "Auth0 Role ID Patient" "")
AUTH0_ROLE_ID_DOCTOR=$(ask "AUTH0_ROLE_ID_DOCTOR" "Auth0 Role ID Doctor" "")
AUTH0_ROLE_ID_ADMIN=$(ask "AUTH0_ROLE_ID_ADMIN" "Auth0 Role ID Admin" "")
WEB_AUTH0_CLIENT_ID=$(ask "WEB_AUTH0_CLIENT_ID" "Auth0 SPA Client ID (web)" "3NN7oWXQ8cm42AI8nsASi39rbHmbi1cR")
echo ""

# ── Gemini ────────────────────────────────────────────────
echo "--- Google Gemini ---"
AI_ENABLED=$(ask "AI_ENABLED" "¿Habilitar Gemini AI? (true/false)" "true")
GEMINI_MODEL=$(ask "GEMINI_MODEL" "Modelo Gemini" "gemini-2.5-flash")
echo ""

# ── Generar archivo tfvars ────────────────────────────────
mkdir -p "$DEPLOY_DIR/terraform"
cat > "$TFVARS_FILE" <<EOF
# Auto-generado por 01-configure.sh
# NO subas este archivo a GitHub (está en .gitignore)

aws_account_id = "$ACCOUNT_ID"
aws_region     = "$REGION"

github_repo_backend = "$GITHUB_REPO_BACKEND"
github_repo_web     = "$GITHUB_REPO_WEB"
github_branch       = "$GITHUB_BRANCH"

auth0_domain          = "$AUTH0_DOMAIN"
auth0_audience        = "$AUTH0_AUDIENCE"
auth0_m2m_client_id   = "$AUTH0_M2M_CLIENT_ID"
auth0_role_id_patient = "$AUTH0_ROLE_ID_PATIENT"
auth0_role_id_doctor  = "$AUTH0_ROLE_ID_DOCTOR"
auth0_role_id_admin   = "$AUTH0_ROLE_ID_ADMIN"
web_auth0_client_id   = "$WEB_AUTH0_CLIENT_ID"

ai_enabled   = $AI_ENABLED
gemini_model = "$GEMINI_MODEL"
EOF

echo ""
echo "======================================================"
echo "✅ Configuración guardada en:"
echo "   $TFVARS_FILE"
echo ""
echo "PRÓXIMO PASO:"
echo "   bash scripts/02-infra.sh"
