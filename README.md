# SaludDeUna Backend (NestJS)

Backend del MVP de SaludDeUna construido con NestJS + MongoDB. Este documento refleja el estado actual de la API en la rama activa.

## Alcance Implementado

- Registro de pacientes.
- Registro de medicos.
- Login unificado para `PATIENT`, `DOCTOR` y `ADMIN`.
- Verificacion REThUS de medicos por administradores.
- Restriccion de acceso a cola medica para doctores no verificados.
- Metricas tecnicas en memoria para dashboard.
- Endpoints de salud y readiness.
- Seguridad base con JWT, RBAC, throttling y trazabilidad por `x-correlation-id`.

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
- `PatientsModule`
- `DoctorsModule`
- `AdminModule`
- `AdminsModule`
- `NotificationsModule`
- `DashboardModule`
- `ConsultationsModule`

Configuracion global:

- Prefijo global: `v1`.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform`.
- Filtro global de excepciones con salida estandarizada y `correlation_id`.
- Interceptor global para logging estructurado y metricas tecnicas.
- Guardas globales: `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`.

## Seguridad y Comportamiento Transversal

- Autenticacion JWT obligatoria por defecto.
- Endpoints publicos via decorador `@Public()`.
- Autorizacion por rol via decorador `@Roles(...)` + `RolesGuard`.
- Limite de peticiones: `20` requests por `60` segundos por cliente.
- Header `x-correlation-id` generado/propagado en todas las respuestas.
- Errores HTTP normalizados por `HttpExceptionFilter`.

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
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
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
| `JWT_ACCESS_EXPIRES_IN` | No | `1h` | Duracion access token. |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Duracion refresh token. |
| `ENABLE_BOOTSTRAP_ADMIN` | No | `false` | Habilita creacion automatica de admin. |
| `BOOTSTRAP_ADMIN_EMAIL` | No | - | Email del admin inicial. |
| `BOOTSTRAP_ADMIN_PASSWORD` | No | - | Password del admin inicial. |
| `BOOTSTRAP_ADMIN_FIRST_NAME` | No | `System` | Nombre del admin inicial. |
| `BOOTSTRAP_ADMIN_LAST_NAME` | No | `Admin` | Apellido del admin inicial. |

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

Tokens emitidos en login:

- `access_token`
- `refresh_token`

## Matriz de Acceso

| Endpoint | Publico | Requiere JWT | Roles |
| --- | --- | --- | --- |
| `POST /v1/auth/patient/register` | Si | No | - |
| `POST /v1/auth/doctor/register` | Si | No | - |
| `POST /v1/auth/login` | Si | No | - |
| `POST /v1/admin/doctors/:doctorId/doctor-verify` | No | Si | `ADMIN` |
| `GET /v1/consultations/queue` | No | Si | `DOCTOR` + verificado |
| `GET /v1/doctors/me` | No | Si | `DOCTOR` |
| `GET /v1/dashboard/technical` | No | Si | `ADMIN` |
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

### 3) Login

`POST /v1/auth/login`

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
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "...",
    "email": "laura@example.com",
    "role": "DOCTOR"
  }
}
```

### 4) Verificacion REThUS por admin

`POST /v1/admin/doctors/:doctorId/rethus-verify`

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

### 5) Perfil de medico autenticado

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
  "timestamp": "2026-03-08T18:06:33.404Z"
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
