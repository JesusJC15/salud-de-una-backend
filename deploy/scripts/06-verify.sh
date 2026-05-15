#!/bin/bash
# ============================================================
# SCRIPT 06 — Verificar que todo funciona
# ============================================================
set -euo pipefail

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
OUTPUTS_FILE="$HOME/.salud-de-una-tf-outputs.json"
CLUSTER="salud-de-una-dev"

echo "======================================================"
echo " SaludDeUna — Verificación del despliegue"
echo "======================================================"

ALB_DNS=$(python3 -c "import json; d=json.load(open('$OUTPUTS_FILE')); print(d['alb_dns_name']['value'])" 2>/dev/null || echo "")

if [[ -z "$ALB_DNS" ]]; then
  echo "ERROR: No puedo leer el DNS del ALB. Ejecuta primero bash scripts/02-infra.sh"
  exit 1
fi

echo ""
echo "DNS del ALB: $ALB_DNS"
echo ""

# ── Verificar Backend ─────────────────────────────────────
echo "--- Backend ---"

echo -n "  /v1/health   → "
if curl -sf --max-time 10 "http://${ALB_DNS}/v1/health" -o /tmp/health_resp.json; then
  STATUS=$(python3 -c "import json; d=json.load(open('/tmp/health_resp.json')); print(d.get('status','?'))")
  echo "✅ HTTP 200 | status: $STATUS"
else
  echo "❌ No responde (puede necesitar más tiempo)"
fi

echo -n "  /v1/ready    → "
if curl -sf --max-time 10 "http://${ALB_DNS}/v1/ready" -o /tmp/ready_resp.json; then
  python3 -c "
import json
d = json.load(open('/tmp/ready_resp.json'))
db = d.get('database', d.get('checks', {}).get('database', '?'))
redis = d.get('redis', d.get('checks', {}).get('redis', '?'))
print(f'✅ HTTP 200 | DB: {db} | Redis: {redis}')
"
else
  echo "❌ No responde"
fi

echo ""
echo "--- Web ---"
echo -n "  /api/health  → "
if curl -sf --max-time 10 "http://${ALB_DNS}/api/health" -o /tmp/web_health.json; then
  echo "✅ HTTP 200"
else
  echo "❌ No responde"
fi

echo -n "  Página raíz  → "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${ALB_DNS}/")
if [[ "$HTTP_CODE" =~ ^(200|301|302)$ ]]; then
  echo "✅ HTTP $HTTP_CODE"
else
  echo "⚠️  HTTP $HTTP_CODE"
fi

echo ""
echo "--- ECS Services ---"
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services \
    salud-de-una-dev-backend-api \
    salud-de-una-dev-backend-worker \
    salud-de-una-dev-web \
  --region "$REGION" \
  --query 'services[*].{Nombre:serviceName, Deseado:desiredCount, Corriendo:runningCount, Estado:status}' \
  --output table 2>/dev/null || echo "  (No se pudo consultar ECS)"

echo ""
echo "--- URLs de acceso ---"
echo "  🌐 App Web:     http://${ALB_DNS}/"
echo "  🔌 API:         http://${ALB_DNS}/v1/"
echo "  📖 Swagger:     http://${ALB_DNS}/v1/docs  (solo con auth en producción)"
echo ""
echo "--- Logs en tiempo real ---"
echo "  aws logs tail /ecs/salud-de-una/dev/backend-api --follow --region $REGION"
echo "  aws logs tail /ecs/salud-de-una/dev/backend-worker --follow --region $REGION"
echo "  aws logs tail /ecs/salud-de-una/dev/web --follow --region $REGION"
echo ""
echo "--- Próximos pasos opcionales ---"
echo "  • Agrega el DNS del ALB en Auth0 → Allowed Callback/Logout/Web Origins"
echo "  • Si tienes un dominio propio, configura Route53 + ACM (HTTPS)"
echo "  • Para redesplegar una imagen nueva: bash scripts/04-build.sh && bash scripts/05-deploy.sh"
