# SaludDeUna Backend (NestJS)

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=JesusJC15_salud-de-una-backend)](https://sonarcloud.io/summary/new_code?id=JesusJC15_salud-de-una-backend)

Backend del MVP de SaludDeUna construido con NestJS + MongoDB. Este documento refleja el estado actual de la API en la rama activa.

## Alcance Implementado

- Registro de pacientes y medicos; login separado para pacientes y staff (`DOCTOR`/`ADMIN`).
- Verificacion REThUS de medicos por administradores; bandeja admin con estados y filtros.
- Restriccion de acceso a cola medica para doctores no verificados.
- Notificaciones internas consumibles por frontend autenticado.
- Triage guiado por IA con cuestionarios por especialidad (Medicina General, Odontologia, Urgencias) y deteccion de red flags.
- Cola de consultas medicas con estados (PENDING, IN_PROGRESS, COMPLETED, CANCELLED).
- Chat clinico en tiempo real via WebSocket (Socket.IO) entre paciente y doctor.
- Resumen clinico y analisis IA con Google Gemini 2.5-flash; guardrail de contenido medico.
- Seguimiento post-consulta (followups) con timeline evolutivo del paciente.
- Monetizacion simulada: precios por especialidad (BillingPrice), ciclo de vida de transacciones (PENDING → COMPLETED → REFUNDED), metricas de revenue para admin.
- Knowledge base con documentos clinicos, chunking y embeddings vectoriales (MongoDB Atlas Vector Search).
- RAG (Retrieval-Augmented Generation) para contexto clinico en triage y resumen.
- Metricas tecnicas (p95 latencia, error rate) y KPIs de negocio calculados desde MongoDB.
- Observabilidad: OpenTelemetry (trazas OTLP), logs estructurados, auditoria de operaciones IA.
- Endpoints de salud (`/v1/health`) y readiness (`/v1/ready`).
- Seguridad: JWT + RBAC, throttling distribuido (Redis), trazabilidad por `x-correlation-id`, Helmet, CORS por frontend.
- Sesiones con access token y refresh token JWT; limite de sesiones activas por usuario.
- Outbox transaccional para eventos de dominio criticos.

## Stack Tecnico

- Node.js 20+
- NestJS 11
- TypeScript 5
- MongoDB + Mongoose 9
- Autenticacion con `@nestjs/jwt` y `passport-jwt`
- Validacion con `class-validator` y `ValidationPipe` global
- Configuracion tipada con `@nestjs/config` + Joi
- Pruebas con Jest + Supertest + `mongodb-memory-server`

## Arquitectura Modular

Modulos cargados en `src/app.module.ts`:

- `AuthModule` — registro, login, refresh, logout, sesiones JWT
- `AiModule` — integración Gemini, health-check administrativo, auditoria IA
- `PatientsModule` — perfil y datos clínicos del paciente
- `DoctorsModule` — perfil, especialidades, resubmision REThUS
- `AdminModule` — bandeja de doctores, verificacion REThUS, CRUD de usuarios
- `AdminsModule` — esquema y gestión de usuarios administradores
- `NotificationsModule` — notificaciones internas por rol
- `DashboardModule` — KPIs de negocio y métricas técnicas
- `ConsultationsModule` — cola de consultas medicas, estados, asignacion
- `TriageModule` — cuestionarios por especialidad, red flags, analisis IA
- `ChatModule` — mensajería en tiempo real (Socket.IO WebSocket)
- `FollowupsModule` — seguimiento post-consulta, timeline evolutivo
- `BillingModule` — precios por especialidad, checkout simulado, transacciones, revenue
- `KnowledgeModule` — documentos clínicos, chunking, versionado, embeddings
- `RagModule` — Retrieval-Augmented Generation, trazas, feedback
- `OutboxModule` — patrón transaccional para eventos de dominio críticos
- `RedisModule` — cliente Redis, throttling distribuido, adapter Socket.IO

Configuracion global:

- Prefijo global: `v1`.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform`.
- Filtro global de excepciones con salida estandarizada y `correlation_id`.
- Interceptor global para logging estructurado y metricas tecnicas.
- Guardas globales: `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`.
- Redis Cloud opcional para throttling distribuido, metricas tecnicas distribuidas y jobs BullMQ.
- Outbox transaccional para eventos de dominio criticos.

## Seguridad y Comportamiento Transversal

- Autenticacion JWT obligatoria por defecto.
- Endpoints publicos via decorador `@Public()`.
- Autorizacion por rol via decorador `@Roles(...)` + `RolesGuard`.
- Limite de peticiones: `20` requests por `60` segundos por cliente.
- Header `x-correlation-id` generado/propagado en todas las respuestas.
- Errores HTTP normalizados por `HttpExceptionFilter`.
- CORS configurable por frontend via `.env`.

## Requisitos

- Node.js `>= 20`
- npm `>= 10`
- MongoDB accesible (Atlas o instancia local)

## Inicio Rapido

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` desde plantilla:

```bash
cp .env.development.example .env
```

En PowerShell:

```powershell
Copy-Item .env.development.example .env
```

3. Configurar variables reales en `.env`.

4. Iniciar en modo desarrollo:

```bash
npm run start:dev
```

## Docker

El `docker-compose.yml` queda listo para levantar el backend y MongoDB con defaults locales funcionales:

```bash
docker compose up --build -d
```

En PowerShell:

```powershell
docker compose up --build -d
```

Comandos utiles:

- Ver estado y healthchecks: `docker compose ps`
- Ver logs del backend: `docker compose logs -f app`
- Apagar servicios: `docker compose down`
- Apagar y borrar volumen de Mongo: `docker compose down -v`

URLs esperadas al levantar Compose:

- API: `http://localhost:3000/v1`
- Health: `http://localhost:3000/v1/health`
- Readiness: `http://localhost:3000/v1/ready`

El compose usa defaults locales para `JWT_SECRET`, `JWT_REFRESH_SECRET` y CORS, asi que arranca sin pasos extra. Para despliegues reales, sobreescribe esas variables desde el shell o un archivo `.env` ubicado junto a `docker-compose.yml` antes de ejecutar `docker compose up`.

## Produccion con Docker

Usa [docker-compose.production.yml](./docker-compose.production.yml) cuando MongoDB, Redis y Gemini viven fuera del host Docker. Ese archivo levanta solo la API y espera servicios administrados.

1. Crear el archivo de variables de produccion:

```bash
cp .env.production.docker.example .env.production.docker
```

En PowerShell:

```powershell
Copy-Item .env.production.docker.example .env.production.docker
```

2. Completar en `.env.production.docker`:

- `MONGODB_URI` apuntando a Atlas o tu cluster administrado.
- `REDIS_URL` apuntando a Redis Cloud o tu instancia administrada.
- `JWT_SECRET` y `JWT_REFRESH_SECRET` con secretos reales de 32+ caracteres.
- `CORS_ORIGINS_PATIENT` y `CORS_ORIGINS_STAFF` con tus dominios reales.
- `GEMINI_API_KEY` y `GEMINI_MODEL` si `AI_ENABLED=true`.

3. Si es el primer deploy y todavia no existe un admin, activar bootstrap solo una vez:

- `ENABLE_BOOTSTRAP_ADMIN=true`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`

Despues del primer arranque exitoso y de poder iniciar sesion, vuelve `ENABLE_BOOTSTRAP_ADMIN=false` y redepliega.

4. Validar la configuracion antes de subir:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production.docker config
```

5. Desplegar:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production.docker up --build -d
```

6. Revisar estado:

- `docker compose -f docker-compose.production.yml --env-file .env.production.docker ps`
- `docker compose -f docker-compose.production.yml --env-file .env.production.docker logs -f app`

7. Ejecutar smoke-check post deploy:

```bash
export PROD_BASE_URL=https://api.example.com
export VERIFY_AI=true
export EXPECT_REDIS=true
export PROD_ADMIN_EMAIL=admin@example.com
export PROD_ADMIN_PASSWORD='AdminP@ss1'
node docker/verify-production.js
```

En PowerShell:

```powershell
$env:PROD_BASE_URL='https://api.example.com'
$env:VERIFY_AI='true'
$env:EXPECT_REDIS='true'
$env:PROD_ADMIN_EMAIL='admin@example.com'
$env:PROD_ADMIN_PASSWORD='AdminP@ss1'
node docker/verify-production.js
```

Ese smoke-check valida:

- `GET /v1/health`
- `GET /v1/ready`
- `checks.redis.status === up` cuando `EXPECT_REDIS=true`
- login staff admin
- `POST /v1/admin/ai/health-check` para verificar Gemini

Notas operativas:

- [docker-compose.yml](./docker-compose.yml) sigue siendo el stack local con Mongo incluido.
- [docker-compose.production.yml](./docker-compose.production.yml) es la variante de despliegue con dependencias administradas.
- El healthcheck del contenedor ahora exige Redis sano cuando `REDIS_URL` esta configurado.
- La conectividad Gemini no bloquea el arranque automaticamente; se confirma con `POST /v1/admin/ai/health-check`, endpoint ya disponible en [src/ai/admin-ai.controller.ts](./src/ai/admin-ai.controller.ts).

## Variables de Entorno

Variables validadas por Joi en `src/config/validation.schema.ts`. Plantilla completa en `.env.development.example`.

### Core

| Variable                      | Requerida | Default            | Descripcion                                                                          |
| ----------------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | No        | `development`      | Entorno: `development`, `production`, `test`.                                        |
| `APP_RUNTIME_ROLE`            | No        | `all`              | Rol del proceso: `all`, `api`, `worker`. Usado en CI y produccion.                   |
| `PORT`                        | No        | `3000`             | Puerto HTTP.                                                                         |
| `MONGODB_URI`                 | Si        | -                  | Cadena de conexion MongoDB.                                                          |

### Autenticacion JWT

| Variable                      | Requerida | Default       | Descripcion                                                     |
| ----------------------------- | --------- | ------------- | --------------------------------------------------------------- |
| `JWT_SECRET`                  | Si        | -             | Secreto JWT para access tokens (minimo 32 chars recomendado).   |
| `JWT_REFRESH_SECRET`          | No        | `JWT_SECRET`  | Secreto del refresh token.                                      |
| `JWT_ACCESS_EXPIRES_IN`       | No        | `1h`          | Duracion del access token.                                      |
| `JWT_REFRESH_EXPIRES_IN`      | No        | `7d`          | Duracion del refresh token.                                     |
| `REFRESH_MAX_ACTIVE_SESSIONS` | No        | `3`           | Maximo de sesiones refresh activas por usuario.                 |
| `AUTH_LEGACY_ENABLED`         | No        | `true`        | Habilita autenticacion JWT legacy (complementaria a Auth0).     |

### CORS

| Variable               | Requerida | Default | Descripcion                                       |
| ---------------------- | --------- | ------- | ------------------------------------------------- |
| `CORS_ORIGINS_PATIENT` | No        | -       | Origenes permitidos del frontend paciente (CSV).  |
| `CORS_ORIGINS_STAFF`   | No        | -       | Origenes permitidos del frontend staff (CSV).     |

### Bootstrap de admin inicial

| Variable                     | Requerida | Default  | Descripcion                                    |
| ---------------------------- | --------- | -------- | ---------------------------------------------- |
| `ENABLE_BOOTSTRAP_ADMIN`     | No        | `false`  | Habilita creacion automatica de admin inicial. |
| `BOOTSTRAP_ADMIN_EMAIL`      | No        | -        | Email del admin inicial.                       |
| `BOOTSTRAP_ADMIN_PASSWORD`   | No        | -        | Password del admin inicial.                    |
| `BOOTSTRAP_ADMIN_FIRST_NAME` | No        | `Admin`  | Nombre del admin inicial.                      |
| `BOOTSTRAP_ADMIN_LAST_NAME`  | No        | `System` | Apellido del admin inicial.                    |

### Redis

| Variable                      | Requerida | Default        | Descripcion                                                                        |
| ----------------------------- | --------- | -------------- | ---------------------------------------------------------------------------------- |
| `REDIS_URL`                   | No        | -              | Conexion Redis para throttling distribuido, metricas tecnicas, outbox y BullMQ.    |
| `REDIS_KEY_PREFIX`            | No        | `salud-de-una` | Prefijo de llaves Redis/BullMQ.                                                    |
| `OUTBOX_DISPATCH_INTERVAL_MS` | No        | `1000`         | Intervalo de polling del despachador outbox cuando no hay worker Redis disponible. |

### IA — Google Gemini

| Variable                 | Requerida | Default                  | Descripcion                                               |
| ------------------------ | --------- | ------------------------ | --------------------------------------------------------- |
| `AI_ENABLED`             | No        | `false`                  | Activa la integracion IA (triage, resumen, health-check). |
| `AI_PROVIDER`            | No        | `gemini`                 | Proveedor IA activo.                                      |
| `GEMINI_API_KEY`         | No        | -                        | API key de Google AI Studio.                              |
| `GEMINI_MODEL`           | No        | `gemini-2.5-flash`       | Modelo Gemini para generacion de texto y triage.          |
| `GEMINI_EMBEDDING_MODEL` | No        | `gemini-embedding-001`   | Modelo para generacion de embeddings vectoriales.         |

### RAG (Retrieval-Augmented Generation)

| Variable                    | Requerida | Default                                    | Descripcion                                      |
| --------------------------- | --------- | ------------------------------------------ | ------------------------------------------------ |
| `RAG_SUMMARY_ENABLED`       | No        | `false`                                    | Activa RAG para resumen clinico.                 |
| `RAG_TRIAGE_ENABLED`        | No        | `false`                                    | Activa RAG durante analisis de triage.           |
| `RAG_PATIENT_EVIDENCE_ENABLED` | No     | `false`                                    | Activa RAG para evidencia de paciente.           |
| `RAG_TOP_K`                 | No        | `8`                                        | Chunks a recuperar por consulta.                 |
| `RAG_MAX_CONTEXT_CHUNKS`    | No        | `10`                                       | Maximo de chunks a incluir en el prompt.         |
| `RAG_EMBEDDING_DIMENSIONS`  | No        | `768`                                      | Dimensiones del vector de embedding.             |
| `RAG_VECTOR_INDEX_NAME`     | No        | `salud_de_una_knowledge_chunks_vector_v1`  | Nombre del indice vectorial en MongoDB Atlas.    |

### Observabilidad — OpenTelemetry

| Variable                             | Requerida | Default                   | Descripcion                                        |
| ------------------------------------ | --------- | ------------------------- | -------------------------------------------------- |
| `OTEL_ENABLED`                       | No        | `false`                   | Activa la instrumentacion OpenTelemetry.           |
| `OTEL_SERVICE_NAME`                  | No        | `salud-de-una-backend`    | Nombre del servicio en las trazas OTLP.            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | No        | -                         | URL base del colector OTLP.                        |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | No        | -                         | URL especifica para trazas OTLP (override).        |

## Scripts Disponibles

| Script               | Comando                      | Uso                                                       |
| -------------------- | ---------------------------- | --------------------------------------------------------- |
| `build`              | `npm run build`              | Compila a `dist/`.                                        |
| `start`              | `npm run start`              | Inicia app Nest.                                          |
| `start:dev`          | `npm run start:dev`          | Desarrollo con watch.                                     |
| `start:debug`        | `npm run start:debug`        | Desarrollo con debug + watch.                             |
| `start:prod`         | `npm run start:prod`         | Ejecuta `dist/main`.                                      |
| `typecheck`          | `npm run typecheck`          | Verificacion de tipos TypeScript sin emitir archivos.     |
| `lint`               | `npm run lint`               | Ejecuta ESLint (sin autofix).                             |
| `lint:fix`           | `npm run lint:fix`           | Ejecuta ESLint con autofix.                               |
| `validate:env`       | `npm run validate:env`       | Valida variables de entorno en modo produccion.           |
| `smoke:startup`      | `npm run smoke:startup`      | Arranque de humo: inicia la app y verifica `/v1/ready`.   |
| `verify:production`  | `npm run verify:production`  | Smoke-check completo contra instancia de produccion.      |
| `test`               | `npm run test`               | Pruebas unitarias.                                        |
| `test:watch`         | `npm run test:watch`         | Pruebas unitarias en watch.                               |
| `test:cov`           | `npm run test:cov`           | Cobertura (umbral 80% en statements/branches/functions).  |
| `test:e2e`           | `npm run test:e2e`           | Todas las pruebas end-to-end (requiere MongoDB y Redis).  |
| `test:e2e:auth`      | `npm run test:e2e:auth`      | E2E solo del modulo auth.                                 |
| `test:e2e:admin`     | `npm run test:e2e:admin`     | E2E solo del modulo admin.                                |
| `test:e2e:triage`    | `npm run test:e2e:triage`    | E2E solo del modulo triage.                               |
| `test:e2e:chat`      | `npm run test:e2e:chat`      | E2E solo del modulo chat.                                 |
| `test:e2e:billing`   | `npm run test:e2e:billing`   | E2E solo del modulo billing.                              |
| `test:e2e:followups` | `npm run test:e2e:followups` | E2E solo del modulo followups.                            |

## Endpoints de Salud

Base URL local: `http://localhost:3000/v1`

- `GET /health`
- `GET /ready`

Ejemplo `GET /v1/health`:

```json
{
  "status": "ok",
  "service": "salud-de-una-backend",
  "timestamp": "2026-03-08T18:06:33.404Z",
  "uptimeSeconds": 123
}
```

Ejemplo `GET /v1/ready` cuando Mongo no esta conectado:

```json
{
  "status": "not_ready",
  "service": "salud-de-una-backend",
  "timestamp": "2026-03-08T18:06:33.404Z",
  "checks": {
    "database": {
      "status": "down",
      "detail": "mongoose readyState: 0"
    }
  }
}
```

## Autenticacion y Roles

Roles de usuario:

- `PATIENT`
- `DOCTOR`
- `ADMIN`

Politica de password para registro:

- Minimo 8 caracteres.
- Al menos 1 mayuscula.
- Al menos 1 numero.
- Al menos 1 caracter especial.

Sesiones autenticadas:

- `accessToken` devuelto por login y refresh.
- `refreshToken` devuelto por login y refresh.
- Los endpoints protegidos exigen `Authorization: Bearer <accessToken>`.

## Matriz de Acceso

| Endpoint                                         | Publico | Requiere JWT | Roles                                                                                      |
| ------------------------------------------------ | ------- | ------------ | ------------------------------------------------------------------------------------------ |
| `POST /v1/auth/patient/register`                 | Si      | No           | -                                                                                          |
| `POST /v1/auth/doctor/register`                  | Si      | No           | -                                                                                          |
| `POST /v1/auth/patient/login`                    | Si      | No           | -                                                                                          |
| `POST /v1/auth/staff/login`                      | Si      | No           | -                                                                                          |
| `POST /v1/auth/refresh`                          | Si      | No           | Requiere `refreshToken` en body                                                            |
| `POST /v1/auth/logout`                           | Si      | No           | `refreshToken` opcional en body; si falta, la operación sigue siendo exitosa (idempotente) |
| `GET /v1/auth/me`                                | No      | Si           | `PATIENT` / `DOCTOR` / `ADMIN`                                                             |
| `GET /v1/admin/doctors`                          | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/admin/doctors/review`                   | No      | Si           | `ADMIN`                                                                                    |
| `POST /v1/admin/doctors/:doctorId/doctor-verify` | No      | Si           | `ADMIN` (canonical)                                                                        |
| `POST /v1/admin/doctors/:doctorId/rethus-verify` | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/admin/users`                            | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/admin/users/:role`                      | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/admin/users/:role/:userId`              | No      | Si           | `ADMIN`                                                                                    |
| `PATCH /v1/admin/users/:role/:userId/active`     | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/consultations/queue`                    | No      | Si           | `DOCTOR` + verificado                                                                      |
| `GET /v1/notifications/me`                       | No      | Si           | `PATIENT` / `DOCTOR` / `ADMIN`                                                             |
| `PATCH /v1/notifications/:notificationId/read`   | No      | Si           | `PATIENT` / `DOCTOR` / `ADMIN`                                                             |
| `PATCH /v1/notifications/me/read-all`            | No      | Si           | `PATIENT` / `DOCTOR` / `ADMIN`                                                             |
| `GET /v1/patients/me`                            | No      | Si           | `PATIENT`                                                                                  |
| `PUT /v1/patients/me`                            | No      | Si           | `PATIENT`                                                                                  |
| `GET /v1/doctors/me`                             | No      | Si           | `DOCTOR`                                                                                   |
| `POST /v1/doctors/me/rethus-resubmit`            | No      | Si           | `DOCTOR`                                                                                   |
| `GET /v1/dashboard/technical`                    | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/dashboard/business`                     | No      | Si           | `ADMIN`                                                                                    |
| `POST /v1/triage/sessions`                       | No      | Si           | `PATIENT`                                                                                  |
| `POST /v1/triage/sessions/:sessionId/answers`    | No      | Si           | `PATIENT`                                                                                  |
| `POST /v1/triage/sessions/:sessionId/analyze`    | No      | Si           | `PATIENT`                                                                                  |
| `GET /v1/billing/prices`                         | No      | Si           | `PATIENT`                                                                                  |
| `POST /v1/billing/checkout`                      | No      | Si           | `PATIENT`                                                                                  |
| `POST /v1/billing/checkout/:id/confirm`          | No      | Si           | `PATIENT`                                                                                  |
| `GET /v1/billing/transactions/me`                | No      | Si           | `PATIENT`                                                                                  |
| `GET /v1/billing/transactions/me/:id`            | No      | Si           | `PATIENT`                                                                                  |
| `GET /v1/billing/admin/transactions`             | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/billing/admin/revenue`                  | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/billing/admin/prices`                   | No      | Si           | `ADMIN`                                                                                    |
| `PATCH /v1/billing/admin/prices/:specialty`      | No      | Si           | `ADMIN`                                                                                    |
| `POST /v1/admin/ai/health-check`                 | No      | Si           | `ADMIN`                                                                                    |
| `GET /v1/health`                                 | Si      | No           | -                                                                                          |
| `GET /v1/ready`                                  | Si      | No           | -                                                                                          |

## API de Negocio (Estado Actual)

### 1) Registro de paciente

`POST /v1/auth/patient/register`

Request:

```json
{
  "firstName": "Ana",
  "lastName": "Lopez",
  "email": "ana@example.com",
  "password": "StrongP@ss1",
  "birthDate": "1998-03-10",
  "gender": "FEMALE"
}
```

Response (201):

```json
{
  "id": "...",
  "firstName": "Ana",
  "lastName": "Lopez",
  "email": "ana@example.com",
  "role": "PATIENT",
  "createdAt": "2026-03-08T00:00:00.000Z"
}
```

### 2) Registro de medico

`POST /v1/auth/doctor/register`

Request:

```json
{
  "firstName": "Laura",
  "lastName": "Medina",
  "email": "laura@example.com",
  "password": "StrongP@ss1",
  "specialty": "GENERAL_MEDICINE",
  "personalId": "CC-12345678",
  "phoneNumber": "3001234567",
  "professionalLicense": "RM-001"
}
```

Response (201):

```json
{
  "id": "...",
  "firstName": "Laura",
  "lastName": "Medina",
  "email": "laura@example.com",
  "role": "DOCTOR",
  "specialty": "GENERAL_MEDICINE",
  "doctorStatus": "PENDING",
  "createdAt": "2026-03-08T00:00:00.000Z"
}
```

### 3) Login paciente

`POST /v1/auth/patient/login`

Request:

```json
{
  "email": "laura@example.com",
  "password": "StrongP@ss1"
}
```

Response (200):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "laura@example.com",
    "role": "PATIENT"
  }
}
```

Notas:

- `accessToken` se usa en `Authorization: Bearer <token>`.
- `refreshToken` se envia explicitamente en el body para renovar o cerrar sesion.
- `POST /auth/logout` revoca la sesion de refresh actual en base de datos.
- `GET /auth/me` permite hidratar sesion desde token vigente.
- Si se supera `REFRESH_MAX_ACTIVE_SESSIONS`, el backend revoca primero las sesiones activas mas antiguas.

Plantillas recomendadas:

- `.env.development.example` para entorno local.
- `.env.production.example` para despliegue productivo.

### 4) Login staff (doctor/admin)

`POST /v1/auth/staff/login`

Mismo payload que login paciente. Solo acepta usuarios `DOCTOR` o `ADMIN`.

### 5) Perfil de paciente autenticado

`GET /v1/patients/me`

`PUT /v1/patients/me`

Body de update (opcional):

```json
{
  "firstName": "Laura",
  "lastName": "Suarez",
  "birthDate": "1998-03-10",
  "gender": "FEMALE",
  "email": "laura@example.com",
  "currentPassword": "ActualP@ss1",
  "newPassword": "NuevaP@ss2"
}
```

### 5.1) HU-003 - Triage guiado por IA (Medicina General)

Trazabilidad:

- Historia: HU-003
- Sprint: backlog T-003-05, T-003-07, T-003-08, T-003-09 y T-003-10

Nota de rutas:

- El backlog usa rutas base tipo `apps/api/src/...`; en este repositorio el equivalente real es `src/...`.

#### POST /v1/triage/sessions

Requiere JWT con rol `PATIENT`.

Request:

```json
{
  "specialty": "GENERAL_MEDICINE"
}
```

Response (201):

```json
{
  "sessionId": "67f123...",
  "specialty": "GENERAL_MEDICINE",
  "status": "IN_PROGRESS",
  "questions": [
    {
      "questionId": "MG-Q1",
      "questionText": "Que sintoma principal presentas hoy?"
    }
  ],
  "totalQuestions": 5,
  "answeredCount": 0,
  "remainingQuestions": 5,
  "progressPercent": 0,
  "nextQuestionId": "MG-Q1",
  "isComplete": false
}
```

Errores:

- 400: payload invalido.
- 409: ya existe una sesion `IN_PROGRESS` para el paciente y la especialidad.

#### POST /v1/triage/sessions/:sessionId/answers

Requiere JWT con rol `PATIENT`.

Request:

```json
{
  "answers": [
    { "questionId": "MG-Q1", "answerValue": "cefalea" },
    { "questionId": "MG-Q2", "answerValue": "2 dias" },
    { "questionId": "MG-Q3", "answerValue": 4 },
    { "questionId": "MG-Q4", "answerValue": "no" },
    { "questionId": "MG-Q5", "answerValue": "no" }
  ]
}
```

Response (200):

```json
{
  "sessionId": "67f123...",
  "answersCount": 5,
  "isComplete": true,
  "totalQuestions": 5,
  "answeredCount": 5,
  "remainingQuestions": 0,
  "progressPercent": 100,
  "nextQuestionId": null
}
```

Errores:

- 400: `questionId` invalido o sesion fuera de estado `IN_PROGRESS`.
- 404: sesion inexistente o no pertenece al paciente autenticado.

#### POST /v1/triage/sessions/:sessionId/analyze

Requiere JWT con rol `PATIENT`.

Response (200):

```json
{
  "sessionId": "67f123...",
  "priority": "HIGH",
  "redFlags": [
    {
      "code": "RF-MG-001",
      "specialty": "GENERAL_MEDICINE",
      "severity": "CRITICAL",
      "evidence": "Combinacion de dolor toracico y dificultad respiratoria reportada"
    }
  ],
  "message": "Se detectaron signos de alarma. Tu caso fue priorizado para atencion medica.",
  "highPriorityAlert": true
}
```

Errores:

- 404: sesion inexistente o no pertenece al paciente autenticado.
- 422: sesion incompleta (faltan respuestas obligatorias).
- 503: fallo operativo del proveedor IA durante analisis de Medicina General.

#### Contrato TriageSession (persistencia)

```json
{
  "_id": "ObjectId",
  "patientId": "ObjectId",
  "specialty": "GENERAL_MEDICINE | ODONTOLOGY",
  "status": "IN_PROGRESS | COMPLETED | FAILED",
  "answers": [
    {
      "questionId": "MG-Q1",
      "questionText": "Que sintoma principal presentas hoy?",
      "answerValue": "valor mixto (string/number/boolean)",
      "answeredAt": "2026-04-05T14:10:00.000Z"
    }
  ],
  "analysis": {
    "priority": "LOW | MODERATE | HIGH",
    "redFlags": [
      {
        "code": "RF-MG-001",
        "specialty": "GENERAL_MEDICINE",
        "severity": "CRITICAL | WARNING | INFO",
        "evidence": "texto"
      }
    ],
    "aiSummary": "string opcional",
    "analysisDurationMs": 1234,
    "guardrailApplied": true
  },
  "completedAt": "2026-04-05T14:10:01.000Z",
  "createdAt": "2026-04-05T14:09:00.000Z",
  "updatedAt": "2026-04-05T14:10:01.000Z"
}
```

#### Catalogo Red Flags Medicina General v1

Fuente: `src/triage/rules/red-flags-mg.json`

- RF-MG-001: dolor toracico + dificultad respiratoria -> `CRITICAL`
- RF-MG-002: perdida de consciencia o sincope -> `CRITICAL`
- RF-MG-003: fiebre > 39C + rigidez de nuca -> `CRITICAL`
- RF-MG-004: dolor abdominal intenso de inicio subito -> `CRITICAL`
- RF-MG-005: alteraciones visuales repentinas -> `WARNING`

#### Politica de guardrail

Fuente: `src/triage/rules/guardrail-rules.json`

- Filtro obligatorio de texto IA para categorias: diagnostico, prescripcion y afirmacion clinica.
- Contrato tecnico del guardrail: `check(text) -> { safe, violations[] }`.
- Si `safe=false`:
  - `analysis.aiSummary` no se persiste.
  - `analysis.guardrailApplied=true`.
  - Se emite log estructurado `WARN` con `correlation_id`, `triage_session_id` y `violations`.
- Si `safe=true`, se conserva resumen neutral de urgencia sin diagnostico ni prescripcion.
Notas:

- `currentPassword` es obligatoria cuando el cambio real incluye `email` o `newPassword`.
- Cambiar `email` no revoca las refresh sessions activas.
- Cambiar `newPassword` revoca todas las refresh sessions activas del paciente.

### 6) Bandeja admin de doctores

`GET /v1/admin/doctors`

Query params opcionales:

- `status=PENDING|VERIFIED|REJECTED`
- `specialty=GENERAL_MEDICINE|ODONTOLOGY`
- `search=<texto>`

Response:

```json
{
  "summary": {
    "total": 12,
    "pending": 4,
    "verified": 7,
    "rejected": 1
  },
  "items": [
    {
      "id": "...",
      "firstName": "Laura",
      "lastName": "Medina",
      "email": "laura@example.com",
      "specialty": "GENERAL_MEDICINE",
      "doctorStatus": "PENDING",
      "latestVerification": null
    }
  ]
}
```

### 7) Verificacion REThUS por admin (compatibilidad dual)

`POST /v1/admin/doctors/:doctorId/doctor-verify` (canonical)

`POST /v1/admin/doctors/:doctorId/rethus-verify` (alias de compatibilidad front)

Requiere:

- Header `Authorization: Bearer <token>`
- Rol `ADMIN`

Request:

```json
{
  "programType": "UNIVERSITY",
  "titleObtainingOrigin": "LOCAL",
  "professionOccupation": "MEDICO GENERAL",
  "startDate": "2024-01-15",
  "rethusState": "VALID",
  "administrativeAct": "ACT-2026-001",
  "reportingEntity": "MINISTERIO DE SALUD",
  "evidenceUrl": "https://example.com/evidence.pdf",
  "notes": "Validacion administrativa"
}
```

Response (201):

```json
{
  "doctorId": "...",
  "doctorStatus": "VERIFIED",
  "checkedAt": "2026-03-08T00:00:00.000Z",
  "verification": {
    "programType": "UNIVERSITY",
    "titleObtainingOrigin": "LOCAL",
    "professionOccupation": "MEDICO GENERAL",
    "startDate": "2024-01-15T00:00:00.000Z",
    "rethusState": "VALID",
    "administrativeAct": "ACT-2026-001",
    "reportingEntity": "MINISTERIO DE SALUD",
    "checkedBy": "admin@example.com",
    "evidenceUrl": "https://example.com/evidence.pdf",
    "notes": "Validacion administrativa"
  }
}
```

Regla de negocio aplicada:

- `rethusState=VALID` -> `doctorStatus=VERIFIED`
- `rethusState=EXPIRED` -> `doctorStatus=REJECTED`
- `rethusState=PENDING` -> `doctorStatus=PENDING`

Payload alterno compacto soportado por ambos endpoints:

```json
{
  "action": "APPROVE",
  "notes": "Validacion manual",
  "evidenceUrl": "https://example.com/evidence.pdf"
}
```

### 8) Notificaciones autenticadas

`GET /v1/notifications/me`

`PATCH /v1/notifications/:notificationId/read`

`PATCH /v1/notifications/me/read-all`

### 9) Perfil de medico autenticado

`GET /v1/doctors/me`

Requiere JWT con rol `DOCTOR`.

Response (200):

```json
{
  "id": "...",
  "firstName": "Laura",
  "lastName": "Medina",
  "email": "laura@example.com",
  "role": "DOCTOR",
  "specialty": "GENERAL_MEDICINE",
  "doctorStatus": "VERIFIED",
  "verification": {
    "programType": "UNIVERSITY",
    "titleObtainingOrigin": "LOCAL",
    "professionOccupation": "MEDICO GENERAL",
    "startDate": "2024-01-15T00:00:00.000Z",
    "rethusState": "VALID",
    "administrativeAct": "ACT-2026-001",
    "reportingEntity": "MINISTERIO DE SALUD",
    "checkedAt": "2026-03-08T00:00:00.000Z",
    "checkedBy": "admin@example.com",
    "evidenceUrl": "https://example.com/evidence.pdf",
    "notes": "Validacion administrativa"
  }
}
```

### 9.1) Resubmision REThUS por medico

`POST /v1/doctors/me/rethus-resubmit`

Requiere JWT con rol `DOCTOR`.

Request:

```json
{
  "notes": "Actualizo soporte",
  "evidenceUrl": "https://example.com/new-evidence.pdf"
}
```

Regla de negocio:

- Solo aplica cuando `doctorStatus=REJECTED`.
- Al reenviar, el estado cambia a `PENDING`.

### 9.2) CRUD minimo de usuarios (ADMIN)

`GET /v1/admin/users`

`GET /v1/admin/users/:role`

`GET /v1/admin/users/:role/:userId`

`PATCH /v1/admin/users/:role/:userId/active`

`PATCH /active` usa body:

```json
{
  "isActive": false
}
```

Nota de contrato (2026-04-05):

- `doctor-verify` se mantiene como ruta canonical para estabilidad del backend.
- `rethus-verify` se mantiene como alias de compatibilidad.
- No hay retiro programado de alias en el MVP actual; cualquier deprecacion futura se anunciara en release notes.

### 10) Dashboard de negocio

`GET /v1/dashboard/business`

Requiere JWT con rol `ADMIN`.

Response (200):

```json
{
  "generatedAt": "2026-03-09T00:00:00.000Z",
  "kpis": {
    "totalPatients": 10,
    "totalDoctors": 6,
    "verifiedDoctors": 4,
    "pendingDoctors": 2
  },
  "doctorStatusBreakdown": {
    "verified": 4,
    "pending": 2,
    "rejected": 0
  },
  "growthLast7Days": {
    "patients": 3,
    "doctors": 2
  },
  "operationalSignals": {
    "unreadNotifications": 5,
    "verificationCoverage": 66.67
  }
}
```

### 11) Cola de consultas

`GET /v1/consultations/queue`

Requiere:

- JWT con rol `DOCTOR`
- `DoctorVerifiedGuard` (solo `doctorStatus=VERIFIED`)

Response (200):

```json
{
  "items": []
}
```

### 12) Dashboard tecnico

`GET /v1/dashboard/technical`

Requiere JWT con rol `ADMIN`.

Response (200):

```json
{
  "sampleSize": 120,
  "p95LatencyMs": 84,
  "errorRate": 0.83,
  "timestamp": "2026-03-08T18:06:33.404Z",
  "source": "redis",
  "degraded": false
}
```

### 13) Health-check administrativo de Gemini

`POST /v1/admin/ai/health-check`

Requiere JWT con rol `ADMIN`.

Response (201):

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "status": "up",
  "latencyMs": 210,
  "checkedAt": "2026-03-21T00:00:00.000Z",
  "degraded": false,
  "requestId": "corr-123"
}
```

## Catalogos y Enums

`Specialty`:

- `GENERAL_MEDICINE`
- `ODONTOLOGY`
- `URGENT_CARE`

`DoctorStatus`:

- `PENDING`
- `VERIFIED`
- `REJECTED`

`RethusState`:

- `VALID`
- `EXPIRED`
- `PENDING`

`ProgramType`:

- `DOCTORATE`
- `UNDEFINED`
- `PROFESSIONAL_TECHNICAL`
- `MASTERS`
- `TECHNOLOGY`
- `SPECIALIZATION`
- `UNIVERSITY`
- `ASSISTANT`

`TitleObtainingOrigin`:

- `LOCAL`
- `FOREIGN`

`UserRole`:

- `PATIENT`
- `DOCTOR`
- `ADMIN`

## Modelo de Datos (Colecciones)

Colecciones principales en MongoDB (una por schema en `src/*/schemas/*.schema.ts`):

### Identidad y sesiones

- `patients`: datos base del paciente (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `birthDate`, `gender`, `isActive`).
- `doctors`: datos del medico (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `specialty`, `personalId`, `phoneNumber`, `professionalLicense`, `doctorStatus`, `isActive`).
- `admins`: usuarios administradores (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `isActive`).
- `refreshsessions`: sesiones JWT activas por usuario (`userId`, `userRole`, `tokenHash`, `expiresAt`, `createdAt`).
- `rethusverifications`: historial de verificaciones REThUS (`doctorId`, `checkedBy`, `rethusState`, `checkedAt`, evidencia).

### Flujo clinico

- `consultations`: consultas medicas con estado PENDING/IN_PROGRESS/COMPLETED/CANCELLED.
- `consultationmessages`: mensajes de chat clinico por consulta (`senderId`, `role`, `content`, `sentAt`).
- `triagesessions`: sesiones de triage por paciente y especialidad, respuestas, analisis IA y red flags.
- `followups`: seguimientos post-consulta con timeline evolutivo y notas medicas.

### Operaciones

- `notifications`: notificaciones internas por destinatario y evento.
- `billingprices`: precios activos por especialidad (seeded al arrancar).
- `transactions`: ciclo de vida de pagos PENDING → COMPLETED → REFUNDED.

### IA y conocimiento

- `aiauditlogs`: trazabilidad de cada llamada IA (modelo, tokens, latencia, resultado).
- `aipromptdefinitions`: prompts versionados por especialidad y funcion.
- `knowledgedocuments`: documentos clinicos con estado de procesamiento.
- `knowledgedocumentversions`: historial de versiones de documentos.
- `knowledgechunks`: fragmentos vectorizados con embedding para RAG.
- `knowledgesources`: fuentes de documentos clinicos.
- `knowledgejobs`: trabajos de ingestion y chunking asincronos.
- `knowledgereviews`: revisiones humanas de documentos.
- `ragtraces`: trazas de consultas RAG (query, chunks recuperados, score).
- `ragfeedbacks`: retroalimentacion por consulta RAG.

### Infraestructura

- `outboxevents`: eventos de dominio pendientes de despacho (patron outbox transaccional).

## Pruebas

### Estrategia

- **Unit tests** (`src/**/*.spec.ts`): prueban servicios y controladores de forma aislada usando mocks a nivel de modulo NestJS. La IA (`AiService`) se mockea siempre en unit tests.
- **E2E tests** (`test/e2e/**`): cubren flujos completos HTTP con `mongodb-memory-server` (base de datos real en memoria) y Redis (si esta disponible). No se mockea la capa de base de datos.
- **Umbral de cobertura**: 80% en statements, branches, functions y lines (configurado en `jest.coverageThreshold`).

### Suites E2E disponibles

| Suite                    | Comando                            | Flujos cubiertos                            |
| ------------------------ | ---------------------------------- | ------------------------------------------- |
| `test:e2e:auth`          | `npm run test:e2e:auth`            | Registro, login, refresh, logout, sesiones  |
| `test:e2e:admin`         | `npm run test:e2e:admin`           | Bandeja doctores, verificacion REThUS, CRUD |
| `test:e2e:doctors`       | `npm run test:e2e:doctors`         | Perfil medico, resubmision                  |
| `test:e2e:patients`      | `npm run test:e2e:patients`        | Perfil paciente, actualizacion              |
| `test:e2e:triage`        | `npm run test:e2e:triage`          | Sesiones triage, respuestas, analisis IA    |
| `test:e2e:consultations` | `npm run test:e2e:consultations`   | Cola consultas, estados                     |
| `test:e2e:notifications` | `npm run test:e2e:notifications`   | Notificaciones, lectura                     |
| `test:e2e:dashboard`     | `npm run test:e2e:dashboard`       | KPIs negocio, metricas tecnicas             |
| `test:e2e:clinical-ai`   | `npm run test:e2e:clinical-ai`     | Resumen clinico IA, guardrail               |
| `test:e2e:chat`          | `npm run test:e2e:chat`            | Chat WebSocket, mensajes                    |
| `test:e2e:followups`     | `npm run test:e2e:followups`       | Seguimiento post-consulta                   |
| `test:e2e:system`        | `npm run test:e2e:system`          | Health, ready, smoke                        |

### Comandos rapidos

```bash
npm run test                    # Unit tests
npm run test:cov                # Unit tests con reporte de cobertura
npm run test:e2e                # Todos los E2E (requiere MongoDB y Redis locales o en CI)
npm run test:e2e:auth           # Solo E2E de autenticacion
```

## Quality Gate

Para considerar un cambio listo:

1. `npm run build`
2. `npm run lint`
3. `npm run test -- --runInBand`
4. `npm run test:e2e -- --runInBand`

## Troubleshooting Rapido

### `GET /v1/ready` devuelve `not_ready` con `mongoose readyState: 0`

Significa que la app no logro conectarse a MongoDB.

Validar:

- `MONGODB_URI` definida y correcta en `.env`.
- Si es Atlas: IP autorizada, usuario y password validos.
- Si password tiene caracteres especiales, usar URL encoding.
- Instancia Mongo accesible por red.

### `npm run start` falla al iniciar

Revisar primero:

- Variables obligatorias faltantes (`MONGODB_URI`, `JWT_SECRET`).
- Errores de conexion Mongo en logs de arranque.
- Puerto `PORT` ocupado por otro proceso.

## Estructura de Carpetas

```text
src/
  admin/          # Bandeja admin: doctores, REThUS, CRUD usuarios
  admins/         # Schema y gestion de usuarios administradores
  ai/             # Integracion Gemini, health-check, audit logs, prompts versionados
  auth/           # Registro, login, refresh, logout, estrategias JWT, sesiones
  billing/        # Precios por especialidad, checkout simulado, transacciones, revenue
  chat/           # Gateway WebSocket (Socket.IO), mensajes de consulta clinica
  common/         # Decoradores, enums, filtros, guards, interceptores, interfaces, utils
  config/         # Factories de configuracion tipada + schema de validacion Joi
  consultations/  # Cola de consultas medicas, estados, asignacion de doctor
  dashboard/      # KPIs de negocio + metricas tecnicas (p95, error rate)
  doctors/        # Perfil medico, especialidades, resubmision REThUS
  followups/      # Seguimiento post-consulta, timeline evolutivo, notas medicas
  knowledge/      # Documentos clinicos, chunking, versionado, embeddings, ingestion
  notifications/  # Notificaciones internas por rol y evento
  observability/  # Logs estructurados, metricas, alertas operativas
  outbox/         # Patron transaccional: despacho confiable de eventos de dominio
  patients/       # Perfil del paciente, datos clinicos, actualizacion
  rag/            # RAG: retrieval, trazas, scoring, feedback
  redis/          # Cliente Redis, throttling distribuido, adapter Socket.IO
  tools/          # Herramientas auxiliares (scripts, utilidades de arranque)
  triage/         # Cuestionarios por especialidad, red flags, analisis IA, guardrail
  app.module.ts
  main.ts
test/
  e2e/            # Pruebas end-to-end por dominio (auth, admin, triage, chat, etc.)
  mocks/          # Mocks compartidos entre suites (ej: jwks-rsa)
  jest-e2e.json   # Configuracion Jest para E2E
  jest.env.ts     # Variables de entorno para pruebas
  jest.setup.ts   # Setup global (conexion MongoDB en memoria)
docker/
  verify-production.js  # Smoke-check post-deploy contra instancia de produccion
scripts/
  run-jest.js           # Wrapper Jest con soporte de paths personalizados
  smoke-startup.js      # Arranque de humo: inicia app y verifica /v1/ready
  validate-env.js       # Validacion de variables de entorno en modo produccion
```

## Trazabilidad y Documentacion del Producto

- [SaludDeUna - Wiki](https://dev.azure.com/salud-de-una/SaludDeUna/_wiki/wikis/SaludDeUna.wiki/1/SaludDeUna-Wiki)
