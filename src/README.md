# README — src/

Mapa de arquitectura del backend NestJS por dominios. Cada subdirectorio es un modulo independiente con responsabilidades delimitadas.

## Archivos raiz

| Archivo             | Proposito                                                        |
| ------------------- | ---------------------------------------------------------------- |
| `app.module.ts`     | Modulo raiz: guards globales, throttler, Mongoose, imports.      |
| `main.ts`           | Entry point: bootstrap, Helmet, CORS, prefijo `/v1`, Swagger.    |
| `app.controller.ts` | Controlador raiz minimo (health/ready delegados al AppService).  |
| `app.service.ts`    | Servicio raiz; no contiene logica de dominio.                    |
| `modules.spec.ts`   | Test de carga de todos los modulos del sistema.                  |

## Modulos de dominio

### auth/

Autenticacion y gestion de sesiones JWT para los tres roles.

- Registro separado para `PATIENT` y `DOCTOR`.
- Login separado: `/auth/patient/login` y `/auth/staff/login`.
- Emision y renovacion de access/refresh tokens.
- Logout con revocacion de refresh token en base de datos.
- Limite de sesiones activas por usuario (`REFRESH_MAX_ACTIVE_SESSIONS`).
- Estrategias Passport: `jwt-legacy` (HS256 propio) y `jwt-provision` (Auth0).
- Guard global `JwtAuthGuard`; endpoints publicos via `@Public()`.

### admin/

Operaciones administrativas sobre doctores y usuarios.

- Bandeja de doctores con filtros (`status`, `specialty`, `search`).
- Verificacion REThUS: endpoint canonical `doctor-verify` y alias `rethus-verify`.
- CRUD minimo de usuarios: listar, ver detalle, activar/desactivar.
- Ruta `POST /admin/ai/health-check` para verificar conectividad Gemini.

### admins/

Schema Mongoose para usuarios de tipo `ADMIN`. No expone endpoints propios; el CRUD se gestiona desde `admin/`.

### ai/

Integracion con Google Gemini via `@google/genai`.

- `AiService`: cliente Gemini reutilizable por otros modulos (triage, rag, clinical-ai).
- Schemas: `AiAuditLog` (trazabilidad de cada llamada) y `AiPromptDefinition` (prompts versionados).
- Endpoint `POST /admin/ai/health-check` para diagnostico operativo.
- La IA es opcional: si `AI_ENABLED=false`, el servicio devuelve respuestas de stub.

### billing/

Monetizacion simulada del flujo de consulta.

- `BillingPrice`: precio activo por especialidad (`GENERAL_MEDICINE`, `ODONTOLOGY`, `URGENT_CARE`).
- `BillingPriceSeederService`: siembra precios iniciales en arranque si no existen.
- Endpoints paciente: ver precios, iniciar checkout, confirmar pago, ver transacciones propias.
- Endpoints admin: ver todas las transacciones (filtros: fecha, especialidad, estado), revenue metrics, gestionar precios.
- Ciclo de vida de `Transaction`: `PENDING → COMPLETED → REFUNDED`.

### chat/

Mensajeria clinica en tiempo real.

- Gateway WebSocket con Socket.IO (namespace `consultation`).
- Mensajes persistidos en `consultationmessages`.
- Adapter Redis para soporte multi-instancia cuando `REDIS_URL` esta configurado.
- ACK de entrega para distinguir mensajes enviados, fallidos y reintentables.

### common/

Componentes transversales reutilizados por todos los modulos.

- `decorators/`: `@Public()`, `@Roles()`, `@CorrelationId()`, `@CurrentUser()`.
- `enums/`: `UserRole`, `Specialty`, `DoctorStatus`, `RethusState`, `TransactionStatus`, etc.
- `filters/`: `HttpExceptionFilter` — normaliza errores con `statusCode`, `message`, `correlationId`.
- `guards/`: `JwtAuthGuard`, `RolesGuard`, `DoctorVerifiedGuard`.
- `interceptors/`: `RequestLoggingInterceptor` — logs estructurados y metricas tecnicas por request.
- `interfaces/`: `RequestContext` (request tipado con `user`).
- `middleware/`: `AdminDocsMiddleware` — protege `/v1/docs` en produccion.
- `utils/`: helpers de correlacion, paginacion, sanitizacion.

### config/

Configuracion tipada por dominio, cargada via `@nestjs/config`.

- Factories: `ai.config`, `auth.config`, `database.config`, `knowledge.config`, `notifications.config`, `rag.config`, `redis.config`, `web.config`.
- `validation.schema.ts`: schema Joi que valida variables de entorno al arrancar. Si falla, la app no inicia.

### consultations/

Cola de consultas medicas.

- Estados: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Asignacion de doctor a consulta.
- `GET /consultations/queue`: solo para doctores verificados (`DoctorVerifiedGuard`).

### dashboard/

KPIs y metricas para el panel administrativo.

- `GET /dashboard/business`: totales de pacientes, doctores, crecimiento, señales operativas.
- `GET /dashboard/technical`: p95 de latencia, error rate, fuente (Redis o memoria).

### doctors/

Perfil del medico autenticado.

- `GET /doctors/me`: perfil completo con estado de verificacion REThUS.
- `POST /doctors/me/rethus-resubmit`: reenvio de solicitud cuando `doctorStatus=REJECTED`.

### followups/

Seguimiento clinico post-consulta.

- Schema `Followup` con notas medicas y timeline evolutivo.
- Asociado a una consulta completada.

### knowledge/

Base de conocimiento clinico para RAG.

- `KnowledgeDocument`: documentos con estado (`PENDING`, `PROCESSING`, `ACTIVE`, `FAILED`).
- `KnowledgeDocumentVersion`: historial de versiones de cada documento.
- `KnowledgeChunk`: fragmentos con embedding vectorial para recuperacion semantica.
- `KnowledgeSource`: fuentes de documentos.
- `KnowledgeJob`: trabajos asincronos de ingestion y chunking (BullMQ).
- `KnowledgeReview`: revisiones humanas de documentos.
- Endpoints admin: CRUD de documentos, disparo de ingestion, estado de jobs.

### notifications/

Notificaciones internas del sistema.

- Generadas por eventos de dominio (cambio de estado de doctor, nueva consulta, etc.).
- `GET /notifications/me`: notificaciones del usuario autenticado.
- `PATCH /notifications/:id/read`: marcar como leida.
- `PATCH /notifications/me/read-all`: marcar todas como leidas.

### observability/

Logs estructurados, metricas operativas y alertas internas. No expone endpoints publicos.

### outbox/

Patron transaccional para eventos de dominio criticos.

- `OutboxEvent` se persiste en MongoDB en la misma transaccion que el evento de negocio.
- Un despachador polling (o worker BullMQ si hay Redis) procesa y publica los eventos pendientes.
- Garantia at-least-once para eventos como creacion de consulta, cambio de estado de doctor.

### patients/

Perfil del paciente autenticado.

- `GET /patients/me`: perfil completo.
- `PUT /patients/me`: actualizacion de datos personales, email y password.
- Cambiar password revoca todas las refresh sessions activas.

### rag/

Retrieval-Augmented Generation para contexto clinico.

- `RagTrace`: registro de cada consulta RAG (query, chunks recuperados, latencia, score).
- `RagFeedback`: retroalimentacion sobre la utilidad de la respuesta RAG.
- Activado por flags `RAG_SUMMARY_ENABLED`, `RAG_TRIAGE_ENABLED`, `RAG_PATIENT_EVIDENCE_ENABLED`.

### redis/

Integracion Redis para el sistema.

- `RedisModule`: proveedor del cliente `ioredis`.
- `RedisThrottlerStorage`: almacenamiento distribuido para el `ThrottlerModule`.
- Adapter Socket.IO para soporte multi-instancia del chat.
- Fallback a memoria cuando `REDIS_URL` no esta configurado (no-prod).

### triage/

Motor de triage guiado por IA.

- Cuestionarios por especialidad (`GENERAL_MEDICINE`, `ODONTOLOGY`, `URGENT_CARE`).
- `POST /triage/sessions`: crea sesion de triage para el paciente.
- `POST /triage/sessions/:id/answers`: registra respuestas del cuestionario.
- `POST /triage/sessions/:id/analyze`: analiza con Gemini, detecta red flags, aplica guardrail.
- Catalogo de red flags por especialidad en `src/triage/rules/red-flags-*.json`.
- Guardrail de contenido: filtra diagnosticos, prescripciones y afirmaciones clinicas del output IA.

### tools/

Utilidades auxiliares de arranque y scripts internos. No forma parte del flujo HTTP principal.

## Convenciones de modulo

- Cada modulo exporta solo lo necesario para otros modulos (principio de minima exposicion).
- Los schemas Mongoose viven en `src/<modulo>/schemas/`.
- Los DTOs de entrada/salida viven en `src/<modulo>/dto/`.
- Los tests unitarios estan junto al archivo que prueban (`*.spec.ts`).
- Los tests E2E estan en `test/e2e/<modulo>/`.
- Cada modulo tiene su propio `README.md` con contratos y ejemplos especificos.

## Comportamiento global

Configurado en `app.module.ts` y `main.ts`:

- **Prefijo global**: `/v1`
- **ValidationPipe**: `whitelist`, `forbidNonWhitelisted`, `transform`
- **Guards globales**: `ThrottlerGuard` (20 req/60s) → `JwtAuthGuard` → `RolesGuard`
- **Interceptor global**: `RequestLoggingInterceptor` (logs + metricas tecnicas)
- **Filtro global**: `HttpExceptionFilter` (errores normalizados con `correlationId`)
- **Swagger**: disponible en `/v1/docs` en entornos non-production
- **Helmet**: cabeceras de seguridad HTTP en todos los endpoints
- **CORS**: configurado por frontend via `CORS_ORIGINS_PATIENT` y `CORS_ORIGINS_STAFF`
