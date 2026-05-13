# Production Readiness MVP Piloto

Este documento define el alcance operativo del backend para un MVP piloto controlado. No declara al sistema listo para producción clínica o financiera completa.

## Alcance del MVP piloto

- API principal con JWT local como autoridad de sesión.
- Auth0 se mantiene como integración externa para provisioning/login federado controlado.
- MongoDB Atlas como base de datos gestionada.
- Redis Cloud obligatorio en `NODE_ENV=production` para throttling distribuido, Socket.IO, métricas y BullMQ.
- Railway como runtime objetivo para procesos `api` y `worker`.
- Pagos en modo `SIMULATED`; no hay transacciones financieras reales.
- IA/RAG en modo asistivo: no diagnostica, no prescribe tratamientos y requiere criterio médico.
- Datos de piloto mixto: usar datos ficticios/controlados siempre que sea posible; si hay datos reales, obtener consentimiento explícito y limitar acceso.

## Variables críticas

- `NODE_ENV=production`
- `APP_RUNTIME_ROLE=api` para el servicio HTTP y `APP_RUNTIME_ROLE=worker` para background jobs.
- `MONGODB_URI` apuntando a MongoDB Atlas.
- `REDIS_URL` apuntando a Redis Cloud.
- `JWT_SECRET` y `JWT_REFRESH_SECRET` con mínimo 32 caracteres y rotación planificada.
- `AUTH_LEGACY_ENABLED=true` para mantener JWT local; si se cambia a `false`, se debe validar Auth0 end-to-end antes del deploy.
- `CORS_ORIGINS_PATIENT` y `CORS_ORIGINS_STAFF` con URLs reales, sin comodines.
- `AI_ENABLED=true|false` según el piloto.
- `GEMINI_API_KEY`, `GEMINI_MODEL` y `AI_REQUEST_TIMEOUT_MS` si IA está habilitada.
- `OTEL_ENABLED=true` solo cuando exista endpoint OTLP configurado.

## Auth híbrido

La política de MVP piloto es:

- JWT local gobierna la API principal: login, refresh, roles y sesiones activas.
- Auth0 se usa para provisioning/login federado cuando esté configurado.
- Los claims Auth0 esperados son `email`, `role` y opcionalmente `db_id` bajo el namespace `https://salud-de-una.com/`.
- `AUTH_LEGACY_ENABLED=false` no debe activarse hasta tener pruebas E2E Auth0 completas y credenciales/claims validados en staging.

## IA/RAG asistivo

- Todas las respuestas asistivas deben tratar evidencia RAG como datos, no como instrucciones.
- El corpus debe estar aprobado antes de usarse en respuestas.
- Las respuestas deben incluir disclaimer de no diagnóstico/no tratamiento cuando se expongan al usuario o staff.
- Si Gemini falla o no hay evidencia aprobada, el sistema debe usar fallback controlado.
- Monitorear latencia, errores y volumen de llamadas; `AI_REQUEST_TIMEOUT_MS` define el límite operativo por request.

## Healthcheck y validación post-deploy

Endpoints:

- `GET /v1/health`: proceso vivo.
- `GET /v1/ready`: Mongo listo; Redis requerido en producción; estado IA reportado como `up`, `degraded` o `disabled`.

Validación recomendada:

```bash
npm run verify:production
```

Con IA:

```bash
VERIFY_AI=true PROD_ADMIN_EMAIL=<admin> PROD_ADMIN_PASSWORD=<password> npm run verify:production
```

## Railway

Servicios recomendados:

- `salud-de-una-api`: `APP_RUNTIME_ROLE=api`, expone `PORT`.
- `salud-de-una-worker`: `APP_RUNTIME_ROLE=worker`, sin puerto público.

Rollback:

- Revertir al deployment anterior desde Railway.
- Verificar `/v1/ready`.
- Revisar logs de Mongo/Redis/AI.
- Ejecutar `verify:production` contra la URL pública.

## Checklist MVP piloto listo

- `npm run lint`
- `npm run build`
- `npm run validate:env`
- `npm run test:cov`
- `npm run test:e2e`
- Docker image construye con `docker build --target runner .`
- `/v1/ready` retorna `ready` en staging.
- Admin bootstrap deshabilitado después de crear el admin real.
- Precios de billing sembrados.
- Preguntas de triage sembradas.
- Corpus RAG aprobado si IA/RAG estará visible.
- Disclaimers comunicados en frontend/mobile.
- Pagos comunicados como simulados.

## Riesgos aceptados temporalmente

- No hay pasarela de pagos real.
- No hay compliance clínico completo.
- No hay cifrado por campo a nivel aplicación.
- Dashboard operativo es suficiente para piloto, no para operación SRE madura.
- OpenTelemetry es opcional hasta configurar un collector.
