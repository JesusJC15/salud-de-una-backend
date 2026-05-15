#!/bin/bash
# ============================================================
# SCRIPT 05 — Forzar nuevo deploy en ECS
# Después de hacer build, los services necesitan recargar imagen
# ============================================================
set -euo pipefail

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
OUTPUTS_FILE="$HOME/.salud-de-una-tf-outputs.json"
CLUSTER="salud-de-una-dev"

echo "======================================================"
echo " SaludDeUna — Deploy a ECS"
echo "======================================================"

SERVICES=$(python3 -c "
import json
d = json.load(open('$OUTPUTS_FILE'))
svcs = d['ecs_service_names']['value']
print(' '.join(svcs))
" 2>/dev/null || echo "salud-de-una-dev-backend-api salud-de-una-dev-backend-worker salud-de-una-dev-web")

echo ""
echo "Forcing new deployment en los services:"
for svc in $SERVICES; do
  echo "  → $svc"
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$svc" \
    --force-new-deployment \
    --region "$REGION" \
    --no-cli-pager \
    --output text > /dev/null
done

echo ""
echo ">>> Esperando que los services se estabilicen..."
echo "    (Puede tardar 2-5 minutos)"
echo ""

# Esperar estabilización service por service
for svc in $SERVICES; do
  echo "    Esperando: $svc ..."
  aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "$svc" \
    --region "$REGION" && echo "    ✅ $svc estable" || echo "    ⚠️  $svc tardó más de lo esperado, verifica manualmente"
done

echo ""
echo "======================================================"
echo "✅ Todos los services desplegados."
echo ""
echo "PRÓXIMO PASO:"
echo "   bash scripts/06-verify.sh"
