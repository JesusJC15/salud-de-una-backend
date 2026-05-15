#!/bin/bash
# ============================================================
# SCRIPT EXTRA — Diagnosticar y corregir errores comunes
# Ejecutar cuando algo falle
# ============================================================

REGION=$(cat "$HOME/.salud-de-una-region" 2>/dev/null || echo "us-east-1")
CLUSTER="salud-de-una-dev"

echo "======================================================"
echo " SaludDeUna — Diagnóstico de problemas"
echo "======================================================"
echo ""
echo "¿Qué problema tienes?"
echo "  1) ECS task se detiene inmediatamente (STOPPED)"
echo "  2) CodeBuild falla"
echo "  3) La app responde pero da error 502"
echo "  4) MongoDB no conecta"
echo "  5) Redis no conecta"
echo "  6) Ver logs en tiempo real"
echo "  7) Forzar nuevo deploy"
echo "  8) Ver estado de todos los services"
echo ""
read -rp "Elige [1-8]: " choice

case "$choice" in
  1)
    echo ""
    echo ">>> Buscando tasks detenidas recientemente..."
    for svc in backend-api backend-worker web; do
      TASK_ARN=$(aws ecs list-tasks \
        --cluster "$CLUSTER" \
        --service-name "${CLUSTER}-${svc}" \
        --desired-status STOPPED \
        --query 'taskArns[0]' \
        --output text \
        --region "$REGION" 2>/dev/null || echo "")

      if [[ -n "$TASK_ARN" && "$TASK_ARN" != "None" ]]; then
        echo ""
        echo "--- Service: $svc ---"
        aws ecs describe-tasks \
          --cluster "$CLUSTER" \
          --tasks "$TASK_ARN" \
          --region "$REGION" \
          --query 'tasks[0].{StopCode:stopCode, StopReason:stoppedReason, Containers:containers[*].{Name:name, ExitCode:exitCode, Reason:reason}}' \
          --output json
      fi
    done
    echo ""
    echo "Causas más comunes:"
    echo "  • CannotPullContainerError → imagen no existe en ECR (ejecuta scripts/04-build.sh)"
    echo "  • ExitCode 1 → error en la app (revisa logs con opción 6)"
    echo "  • Secret no encontrado → ejecuta scripts/03-secrets.sh y verifica los valores"
    ;;

  2)
    echo ""
    read -rp "Nombre del proyecto CodeBuild (salud-de-una-dev-build-backend o -web): " project
    BUILD_ID=$(aws codebuild list-builds-for-project \
      --project-name "$project" \
      --sort-order DESCENDING \
      --query 'ids[0]' \
      --output text \
      --region "$REGION")
    echo "Último build: $BUILD_ID"
    echo ""
    LOGS=$(aws codebuild batch-get-builds \
      --ids "$BUILD_ID" \
      --region "$REGION" \
      --query 'builds[0].logs.{Group:groupName, Stream:streamName}' \
      --output json)
    LOG_GROUP=$(echo "$LOGS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Group'])")
    LOG_STREAM=$(echo "$LOGS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Stream'])")
    echo "Ver logs completos:"
    echo "  aws logs get-log-events --log-group-name '$LOG_GROUP' --log-stream-name '$LOG_STREAM' --region $REGION --output text --query 'events[*].message'"
    echo ""
    echo "Causas comunes de fallo en CodeBuild:"
    echo "  • Repo privado sin GitHub Token → ejecuta scripts/03-secrets.sh y llena GITHUB_TOKEN"
    echo "  • Dockerfile falla → verifica que el Dockerfile compila localmente"
    echo "  • Error de ECR push → verifica permisos IAM del role CodeBuild"
    ;;

  3)
    echo ""
    echo "Error 502 = la task ECS no responde al health check del ALB"
    echo ""
    echo "Verificando target groups..."
    aws elbv2 describe-target-health \
      --target-group-arn "$(aws elbv2 describe-target-groups \
        --names salud-de-una-dev-backend \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text \
        --region "$REGION")" \
      --region "$REGION" \
      --query 'TargetHealthDescriptions[*].{IP:Target.Id, Port:Target.Port, State:TargetHealth.State, Reason:TargetHealth.Reason}' \
      --output table
    echo ""
    echo "Si el estado es 'unhealthy':"
    echo "  • La task está corriendo pero /v1/ready devuelve error"
    echo "  • Revisa los logs: opción 6"
    echo "  • Verifica que MongoDB y Redis están accesibles (opciones 4 y 5)"
    ;;

  4)
    echo ""
    echo "MongoDB Atlas — pasos para verificar:"
    echo ""
    echo "1. Ve a MongoDB Atlas → Network Access → IP Access List"
    echo "2. Agrega 0.0.0.0/0 (temporalmente, para Fargate con IPs dinámicas)"
    echo "   O: agrega las IPs públicas de las tasks (cambian con cada restart)"
    echo ""
    echo "3. Verifica el connection string en SSM:"
    MONGODB_URI=$(aws ssm get-parameter \
      --name "/salud-de-una/MONGODB_URI" \
      --with-decryption \
      --query 'Parameter.Value' \
      --output text \
      --region "$REGION" 2>/dev/null || echo "NO CONFIGURADO")
    if [[ "$MONGODB_URI" == "placeholder" ]]; then
      echo "   ❌ MONGODB_URI = placeholder → ejecuta scripts/03-secrets.sh"
    elif [[ -z "$MONGODB_URI" || "$MONGODB_URI" == "NO CONFIGURADO" ]]; then
      echo "   ❌ MONGODB_URI no encontrado → ejecuta scripts/03-secrets.sh"
    else
      # Mostrar solo el host, sin credenciales
      HOST=$(echo "$MONGODB_URI" | sed 's|mongodb+srv://[^@]*@||' | cut -d'/' -f1)
      echo "   ✅ MONGODB_URI configurado. Host: $HOST"
    fi
    ;;

  5)
    echo ""
    echo "Redis Cloud — verificar:"
    REDIS_URL=$(aws ssm get-parameter \
      --name "/salud-de-una/REDIS_URL" \
      --with-decryption \
      --query 'Parameter.Value' \
      --output text \
      --region "$REGION" 2>/dev/null || echo "")
    if [[ "$REDIS_URL" == "placeholder" || -z "$REDIS_URL" ]]; then
      echo "  ❌ REDIS_URL = placeholder → ejecuta scripts/03-secrets.sh"
    else
      HOST=$(echo "$REDIS_URL" | sed 's|rediss://[^@]*@||' | cut -d':' -f1)
      echo "  ✅ REDIS_URL configurado. Host: $HOST"
      echo ""
      echo "Si el backend no conecta a Redis:"
      echo "  • Verifica que el plan de Redis Cloud tiene TLS habilitado (rediss:// con SSL)"
      echo "  • Verifica que la contraseña en la URL es correcta"
      echo "  • Redis Cloud Free requiere que la URL incluya usuario y contraseña"
    fi
    ;;

  6)
    echo ""
    echo "¿Qué logs quieres ver?"
    echo "  1) backend-api    2) backend-worker    3) web"
    read -rp "  Elige [1-3]: " log_choice
    case "$log_choice" in
      1) GROUP="/ecs/salud-de-una/dev/backend-api" ;;
      2) GROUP="/ecs/salud-de-una/dev/backend-worker" ;;
      3) GROUP="/ecs/salud-de-una/dev/web" ;;
      *) echo "Opción inválida"; exit 1 ;;
    esac
    echo ""
    echo "Mostrando logs en tiempo real (Ctrl+C para salir):"
    aws logs tail "$GROUP" --follow --region "$REGION"
    ;;

  7)
    echo ""
    echo "Forzando nuevo deploy en todos los services..."
    for svc in backend-api backend-worker web; do
      aws ecs update-service \
        --cluster "$CLUSTER" \
        --service "${CLUSTER}-${svc}" \
        --force-new-deployment \
        --region "$REGION" \
        --no-cli-pager \
        --output text > /dev/null
      echo "  ✅ ${svc} → force-new-deployment"
    done
    echo ""
    echo "Espera 2-5 minutos y luego verifica con: bash scripts/06-verify.sh"
    ;;

  8)
    echo ""
    aws ecs describe-services \
      --cluster "$CLUSTER" \
      --services \
        salud-de-una-dev-backend-api \
        salud-de-una-dev-backend-worker \
        salud-de-una-dev-web \
      --region "$REGION" \
      --query 'services[*].{Service:serviceName, Deseadas:desiredCount, Corriendo:runningCount, Pendientes:pendingCount, Estado:status, Deployments:deployments[0].{Status:status, Corriendo:runningCount}}' \
      --output table
    ;;

  *)
    echo "Opción no válida."
    ;;
esac
