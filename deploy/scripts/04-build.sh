#!/bin/bash
# ============================================================
# SCRIPT 04 — Construir imágenes Docker con AWS CodeBuild
# CloudShell no tiene Docker — CodeBuild lo hace por nosotros
# ============================================================
set -euo pipefail

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
OUTPUTS_FILE="$HOME/.salud-de-una-tf-outputs.json"
export PATH="$HOME/.local/bin:$PATH"

echo "======================================================"
echo " SaludDeUna — Build de imágenes Docker con CodeBuild"
echo "======================================================"

# Leer outputs de Terraform
if [[ ! -f "$OUTPUTS_FILE" ]]; then
  echo "ERROR: No encuentro $OUTPUTS_FILE."
  echo "       Ejecuta primero: bash scripts/02-infra.sh"
  exit 1
fi

ALB_DNS=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['alb_dns_name']['value'])")
BACKEND_PROJECT=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['codebuild_backend_project']['value'])")
WEB_PROJECT=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['codebuild_web_project']['value'])")

echo ""
echo "ALB DNS: $ALB_DNS"
echo ""

# ── Build Backend ─────────────────────────────────────────
echo ">>> Iniciando build del Backend..."
BACKEND_BUILD_ID=$(aws codebuild start-build \
  --project-name "$BACKEND_PROJECT" \
  --region "$REGION" \
  --query 'build.id' \
  --output text)
echo "    Build ID: $BACKEND_BUILD_ID"

# ── Build Web ─────────────────────────────────────────────
echo ""
echo ">>> Iniciando build del Web..."
echo "    (Las variables NEXT_PUBLIC_* se bakearan con el ALB DNS: $ALB_DNS)"
WEB_BUILD_ID=$(aws codebuild start-build \
  --project-name "$WEB_PROJECT" \
  --environment-variables-override \
    "name=NEXT_PUBLIC_API_BASE_URL,value=http://${ALB_DNS}/v1,type=PLAINTEXT" \
    "name=NEXT_PUBLIC_AUTH0_REDIRECT_URI,value=http://${ALB_DNS}/callback,type=PLAINTEXT" \
  --region "$REGION" \
  --query 'build.id' \
  --output text)
echo "    Build ID: $WEB_BUILD_ID"

# ── Función de espera con polling ─────────────────────────
wait_for_build() {
  local build_id=$1
  local label=$2
  local status

  echo ""
  echo ">>> Esperando build $label..."
  echo "    (Puede tardar 5-10 minutos. Mostrando estado cada 30s)"

  while true; do
    status=$(aws codebuild batch-get-builds \
      --ids "$build_id" \
      --region "$REGION" \
      --query 'builds[0].buildStatus' \
      --output text)

    phase=$(aws codebuild batch-get-builds \
      --ids "$build_id" \
      --region "$REGION" \
      --query 'builds[0].currentPhase' \
      --output text 2>/dev/null || echo "")

    echo "    [$(date '+%H:%M:%S')] Status: $status | Fase: $phase"

    case "$status" in
      SUCCEEDED)
        echo "    ✅ Build $label completado exitosamente."
        return 0
        ;;
      FAILED|FAULT|TIMED_OUT|STOPPED)
        echo "    ❌ Build $label falló con status: $status"
        echo ""
        echo "    Para ver los logs completos:"
        echo "    aws codebuild batch-get-builds --ids '$build_id' --query 'builds[0].logs' --region $REGION"
        echo ""
        echo "    O en AWS Console → CodeBuild → Build history"
        return 1
        ;;
    esac
    sleep 30
  done
}

# ── Esperar ambos builds ──────────────────────────────────
wait_for_build "$BACKEND_BUILD_ID" "Backend"
BACKEND_OK=$?

wait_for_build "$WEB_BUILD_ID" "Web"
WEB_OK=$?

echo ""
echo "======================================================"
if [[ $BACKEND_OK -eq 0 && $WEB_OK -eq 0 ]]; then
  echo "✅ Ambas imágenes construidas y subidas a ECR."
  echo ""
  echo "PRÓXIMO PASO:"
  echo "   bash scripts/05-deploy.sh"
else
  echo "❌ Uno o más builds fallaron. Revisa los logs en CodeBuild."
  echo "   Soluciona el error y vuelve a ejecutar este script."
  exit 1
fi
