# SaludDeUna Backend (NestJS)

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=JesusJC15_salud-de-una-backend)](https://sonarcloud.io/summary/new_code?id=JesusJC15_salud-de-una-backend)

Backend del MVP de SaludDeUna construido con NestJS + MongoDB. Este documento refleja el estado actual de la API en la rama activa.

## Alcance Implementado

- Registro de pacientes.
- Registro de medicos.
- Login separado para frontend de pacientes y frontend staff (`DOCTOR`/`ADMIN`).
- Verificacion REThUS de medicos por administradores.
- Restriccion de acceso a cola medica para doctores no verificados.
- Bandeja admin para revisar doctores y su ultimo estado REThUS.
- Notificaciones internas consumibles por frontend autenticado.
- Metricas tecnicas en memoria para dashboard.
- KPIs de negocio calculados desde MongoDB para staff.
- Endpoints de salud y readiness.
- Seguridad base con JWT, RBAC, throttling y trazabilidad por `x-correlation-id`.
- Sesiones basadas en access token y refresh token JWT.

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

- `AuthModule`
- `AiModule`
- `PatientsModule`
- `DoctorsModule`
- `AdminModule`
- `AdminsModule`
- `NotificationsModule`
- `DashboardModule`
- `ConsultationsModule`
- `OutboxModule`
- `RedisModule`

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

## Variables de Entorno

Variables requeridas por validacion Joi (`src/config/validation.schema.ts`):

| Variable | Requerida | Default | Descripcion |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Entorno: `development`, `production`, `test`. |
| `PORT` | No | `3000` | Puerto HTTP. |
| `MONGODB_URI` | Si | - | Cadena de conexion MongoDB. |
| `JWT_SECRET` | Si | - | Secreto JWT (minimo 32 chars recomendado). |
| `JWT_REFRESH_SECRET` | No | `JWT_SECRET` | Secreto del refresh token. |
| `JWT_ACCESS_EXPIRES_IN` | No | `1h` | Duracion access token. |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Duracion refresh token. |
| `REFRESH_MAX_ACTIVE_SESSIONS` | No | `3` | Maximo de sesiones refresh activas por usuario. |
| `CORS_ORIGINS_PATIENT` | No | - | Origenes permitidos del frontend paciente (CSV). |
| `CORS_ORIGINS_STAFF` | No | - | Origenes permitidos del frontend staff (CSV). |
| `ENABLE_BOOTSTRAP_ADMIN` | No | `false` | Habilita creacion automatica de admin. |
| `BOOTSTRAP_ADMIN_EMAIL` | No | - | Email del admin inicial. |
| `BOOTSTRAP_ADMIN_PASSWORD` | No | - | Password del admin inicial. |
| `BOOTSTRAP_ADMIN_FIRST_NAME` | No | `Admin` | Nombre del admin inicial. |
| `BOOTSTRAP_ADMIN_LAST_NAME` | No | `System` | Apellido del admin inicial. |
| `REDIS_URL` | No | - | Conexion Redis Cloud para throttling distribuido, metricas tecnicas y outbox/BullMQ. |
| `REDIS_KEY_PREFIX` | No | `salud-de-una` | Prefijo de llaves Redis/BullMQ. |
| `OUTBOX_DISPATCH_INTERVAL_MS` | No | `1000` | Intervalo de polling del despachador outbox; con Redis disponible encola en BullMQ y sin Redis procesa inline. |
| `AI_ENABLED` | No | `false` | Activa la integracion AI administrativa. |
| `AI_PROVIDER` | No | `gemini` | Proveedor AI activo. |
| `GEMINI_API_KEY` | No | - | API key de Google AI Studio para Gemini. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Modelo Gemini por defecto para health-check y prompts versionados. |

## Scripts Disponibles

| Script | Comando | Uso |
| --- | --- | --- |
| `build` | `npm run build` | Compila a `dist/`. |
| `start` | `npm run start` | Inicia app Nest. |
| `start:dev` | `npm run start:dev` | Desarrollo con watch. |
| `start:debug` | `npm run start:debug` | Desarrollo con debug + watch. |
| `start:prod` | `npm run start:prod` | Ejecuta `dist/main`. |
| `lint` | `npm run lint` | Ejecuta ESLint con autofix. |
| `test` | `npm run test` | Pruebas unitarias. |
| `test:watch` | `npm run test:watch` | Pruebas unitarias en watch. |
| `test:cov` | `npm run test:cov` | Cobertura. |
| `test:e2e` | `npm run test:e2e` | Pruebas end-to-end. |

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

| Endpoint | Publico | Requiere JWT | Roles |
| --- | --- | --- | --- |
| `POST /v1/auth/patient/register` | Si | No | - |
| `POST /v1/auth/doctor/register` | Si | No | - |
| `POST /v1/auth/patient/login` | Si | No | - |
| `POST /v1/auth/staff/login` | Si | No | - |
| `POST /v1/auth/refresh` | Si | No | Requiere `refreshToken` en body |
| `POST /v1/auth/logout` | Si | No | `refreshToken` opcional en body; si falta, la operación sigue siendo exitosa (idempotente) |
| `GET /v1/auth/me` | No | Si | `PATIENT` / `DOCTOR` / `ADMIN` |
| `GET /v1/admin/doctors` | No | Si | `ADMIN` |
| `POST /v1/admin/doctors/:doctorId/doctor-verify` | No | Si | `ADMIN` |
| `GET /v1/consultations/queue` | No | Si | `DOCTOR` + verificado |
| `GET /v1/notifications/me` | No | Si | `PATIENT` / `DOCTOR` / `ADMIN` |
| `PATCH /v1/notifications/:notificationId/read` | No | Si | `PATIENT` / `DOCTOR` / `ADMIN` |
| `PATCH /v1/notifications/me/read-all` | No | Si | `PATIENT` / `DOCTOR` / `ADMIN` |
| `GET /v1/patients/me` | No | Si | `PATIENT` |
| `PUT /v1/patients/me` | No | Si | `PATIENT` |
| `GET /v1/doctors/me` | No | Si | `DOCTOR` |
| `GET /v1/dashboard/technical` | No | Si | `ADMIN` |
| `GET /v1/dashboard/business` | No | Si | `ADMIN` |
| `POST /v1/admin/ai/health-check` | No | Si | `ADMIN` |
| `GET /v1/health` | Si | No | - |
| `GET /v1/ready` | Si | No | - |

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
  "gender": "FEMALE"
}
```

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

### 7) Verificacion REThUS por admin

`POST /v1/admin/doctors/:doctorId/doctor-verify`

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

### 6) Cola de consultas

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

### 7) Dashboard tecnico

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

### 8) Health-check administrativo de Gemini

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

Colecciones principales en MongoDB:

- `patients`: datos base del paciente (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `birthDate`, `gender`, `isActive`).
- `doctors`: datos del medico (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `specialty`, `personalId`, `phoneNumber`, `professionalLicense`, `doctorStatus`, `rethusVerification`, `isActive`).
- `admins`: usuarios administradores (`firstName`, `lastName`, `email`, `passwordHash`, `role`, `isActive`).
- `rethusverifications`: trazabilidad de verificacion REThUS por medico (incluye `checkedBy` y `checkedAt`).
- `notifications`: notificaciones internas de cambios de estado.

## Pruebas

Cobertura de pruebas actual:

- Unit tests de salud/controladores/servicios clave.
- E2E de flujos HU-001/HU-002 con `mongodb-memory-server`.

Comandos:

```bash
npm run test
npm run test:e2e
npm run test:cov
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
  admin/
  admins/
  auth/
  common/
  config/
  consultations/
  dashboard/
  doctors/
  notifications/
  patients/
  app.module.ts
  main.ts
test/
  app.e2e-spec.ts
```

## Trazabilidad y Documentacion del Producto

- [SaludDeUna - Wiki](https://dev.azure.com/salud-de-una/SaludDeUna/_wiki/wikis/SaludDeUna.wiki/1/SaludDeUna-Wiki)
