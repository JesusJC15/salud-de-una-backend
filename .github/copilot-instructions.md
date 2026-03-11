# Copilot Instructions — SaludDeUna Backend

## Project Overview

NestJS 11 REST API backend for **SaludDeUna**, a health platform MVP. Handles patient/doctor registration, unified login, REThUS verification of doctors by admins, a doctor consultation queue, and an admin technical dashboard.

- **Runtime:** Node.js 20+
- **Framework:** NestJS 11
- **Language:** TypeScript 5 (strict mode)
- **Database:** MongoDB 9 via Mongoose 9
- **Auth:** JWT + Passport (`@nestjs/jwt`, `passport-jwt`)
- **Validation:** `class-validator` + `class-transformer` with a global `ValidationPipe`
- **Config:** `@nestjs/config` + Joi validation schema
- **Rate Limiting:** `@nestjs/throttler` (20 req / 60 s)
- **Testing:** Jest (unit) + Supertest + `mongodb-memory-server` (E2E)

---

## Repository Layout

```
src/
  admin/          # Doctor REThUS verification (ADMIN role)
  admins/         # Admin user schema + bootstrap seeder
  auth/           # Registration + login (public endpoints)
  common/
    decorators/   # @Public(), @Roles(...)
    enums/        # UserRole, DoctorStatus, Specialty, …
    filters/      # HttpExceptionFilter (global)
    guards/       # JwtAuthGuard, RolesGuard, DoctorVerifiedGuard
    interceptors/ # RequestLoggingInterceptor (global)
    interfaces/   # JwtPayload, RequestUser, RequestContext
  config/         # auth.config, database.config, validation.schema
  consultations/  # Consultation queue (DOCTOR + verified only)
  dashboard/      # Technical metrics (ADMIN only)
  doctors/        # Doctor profile + schema
  notifications/  # In-memory notifications
  patients/       # Patient schema
  app.module.ts   # Root module
  main.ts         # Bootstrap (global prefix, pipes, filters)
test/
  app.e2e-spec.ts # E2E tests with mongodb-memory-server
```

All routes are prefixed with `/v1` (set in `main.ts` via `app.setGlobalPrefix('v1')`).

---

## Module Architecture

- **One feature module per domain** (`auth`, `doctors`, `patients`, `admin`, etc.).
- Each module owns its own controllers, services, DTOs, and Mongoose schemas.
- Shared utilities live in `src/common/`.
- Configuration lives in `src/config/`.
- **Never place business logic in controllers** — controllers only delegate to services.
- Use constructor injection exclusively; avoid property injection and the service-locator pattern.

---

## Authentication & Authorization

### Global JWT Guard

`JwtAuthGuard` is registered as a global guard in `AppModule`. **Every endpoint requires a valid JWT by default.**

To make an endpoint public (no JWT required), apply the `@Public()` decorator:

```typescript
import { Public } from '../common/decorators/public.decorator';

@Post('login')
@Public()
login(@Body() dto: LoginDto) { … }
```

### Role-Based Access Control

`RolesGuard` is also global. Apply `@Roles(UserRole.ADMIN)` to restrict an endpoint to specific roles:

```typescript
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@Get('technical')
@Roles(UserRole.ADMIN)
getDashboard() { … }
```

Available roles (defined in `src/common/enums/user-role.enum.ts`):

| Enum value | Description |
|---|---|
| `UserRole.PATIENT` | Registered patient |
| `UserRole.DOCTOR` | Registered doctor |
| `UserRole.ADMIN` | Platform administrator |

### Doctor Verification Guard

Use `DoctorVerifiedGuard` on endpoints that require a fully verified doctor:

```typescript
@UseGuards(DoctorVerifiedGuard)
@Get('queue')
getQueue() { … }
```

### JWT Payload

The `JwtPayload` interface (`src/common/interfaces/jwt-payload.interface.ts`) contains `sub` (user ID), `email`, `role`, `tokenType` (`access` | `refresh`), and `jti` (session ID for refresh tokens).

---

## Error Handling

- **Always throw NestJS HTTP exceptions** from services (e.g., `NotFoundException`, `UnauthorizedException`, `ConflictException`). Never throw raw `Error` objects for HTTP errors.
- The global `HttpExceptionFilter` (`src/common/filters/http-exception.filter.ts`) normalises all HTTP error responses and attaches a `correlation_id`.
- All async operations must be properly awaited; do not swallow promise rejections.

---

## Input Validation

The global `ValidationPipe` is configured with:

```typescript
new ValidationPipe({
  whitelist: true,           // strip unknown properties
  forbidNonWhitelisted: true, // throw on unknown properties
  transform: true,
  transformOptions: { enableImplicitConversion: true },
})
```

- Every controller method that accepts a body, query, or param **must use a DTO class** decorated with `class-validator` decorators.
- DTOs live alongside their module (e.g., `src/auth/dto/login.dto.ts`).
- Response serialization should use dedicated response DTOs (e.g., `src/doctors/dto/doctor-me.response.dto.ts`).

---

## Database Conventions (Mongoose)

- Schemas are defined in a `schemas/` folder inside each feature module.
- Always use `{ timestamps: true }` in Mongoose schema options to get `createdAt`/`updatedAt`.
- Password fields are stored as `passwordHash`; never store or return plaintext passwords.
- Use lean queries (`.lean()`) for read-only operations that do not need Mongoose document methods.
- Avoid N+1 queries; prefer `populate()` or aggregation pipelines when joining collections.

---

## Code Style

- **Formatter:** Prettier with `singleQuote: true` and `trailingComma: 'all'`.
- **Linter:** ESLint (flat config in `eslint.config.mjs`) with TypeScript ESLint.
- `no-explicit-any` is turned off — but prefer typed alternatives whenever possible.
- `no-floating-promises` is set to `warn` — always handle or `void` promises explicitly.
- Run `npm run lint` before committing.

---

## Testing

### Unit Tests

- File naming: `*.spec.ts` co-located with the source file (e.g., `auth.service.spec.ts`).
- Use `Test.createTestingModule()` from `@nestjs/testing`.
- Mock external dependencies (Mongoose models, external services) with Jest mock factories.
- Run with `npm run test` or `npm run test -- --runInBand`.

### E2E Tests

- Located in `test/app.e2e-spec.ts`.
- Use `mongodb-memory-server` for an in-memory MongoDB instance — no live database required.
- Use Supertest to exercise full HTTP request/response cycles.
- Run with `npm run test:e2e -- --runInBand`.

### Quality Gate

Before opening a PR:

```bash
npm run build
npm run lint
npm run test -- --runInBand
npm run test:e2e -- --runInBand
```

---

## Environment Variables

Required variables (validated by Joi in `src/config/validation.schema.ts`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `PORT` | No | `3000` | HTTP port |
| `MONGODB_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | JWT signing secret (≥ 32 chars recommended) |
| `JWT_ACCESS_EXPIRES_IN` | No | `1h` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `ENABLE_BOOTSTRAP_ADMIN` | No | `false` | Auto-create initial admin on startup |
| `BOOTSTRAP_ADMIN_EMAIL` | No | — | Bootstrap admin email |
| `BOOTSTRAP_ADMIN_PASSWORD` | No | — | Bootstrap admin password |

Copy `.env.example` to `.env` and fill in the required values before running the application.

---

## NestJS Best Practices (Key Rules)

1. **Feature modules** — organise code by domain, not by technical layer.
2. **Constructor injection** — always inject dependencies via the constructor.
3. **Single responsibility** — keep services focused; avoid "god services".
4. **Throw HTTP exceptions** — use `@nestjs/common` exceptions (`NotFoundException`, `ForbiddenException`, etc.) from services.
5. **Validate all inputs** — every public endpoint must use a DTO with `class-validator` annotations.
6. **Avoid circular dependencies** — if two modules need each other, extract the shared logic into a third module or use `forwardRef()` carefully.
7. **ConfigModule** — access configuration only through `ConfigService`; never read `process.env` directly in business logic.
8. **Use guards, not middleware, for auth** — `JwtAuthGuard` and `RolesGuard` are already global; add `@Public()` or `@Roles()` as needed.
