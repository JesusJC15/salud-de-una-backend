# Endpoints nuevos de la rama feature/admin-rethus

## Contexto rapido
- Prefijo global: /v1
- Autenticacion: JWT (Authorization: Bearer <token>)
- La mayoria de rutas nuevas son para rol ADMIN.

## Resumen para frontend

### Nuevos endpoints
1. GET /v1/admin/doctors/review
2. POST /v1/admin/doctors/:doctorId/doctor-verify
3. GET /v1/admin/users
4. GET /v1/admin/users/:role
5. GET /v1/admin/users/:role/:userId
6. PATCH /v1/admin/users/:role/:userId/active
7. POST /v1/doctors/me/rethus-resubmit
8. POST /v1/admin/ai/health-check

### Endpoint actualizado en esta rama
1. POST /v1/admin/doctors/:doctorId/rethus-verify
- Ahora tambien acepta payload compacto con action: APPROVE | REJECT.

## Detalle endpoint por endpoint

## 1) GET /v1/admin/doctors/review
- Rol requerido: ADMIN
- Proposito: alias de listado para revision REThUS.
- Query params:
  - status (opcional): PENDING | VERIFIED | REJECTED
  - specialty (opcional): GENERAL_MEDICINE | ODONTOLOGY
  - search (opcional): texto libre
  - page (opcional, default 1)
  - limit (opcional, default 20, max 100)
- Respuesta 200:
  - summary: { total, pending, verified, rejected }
  - pagination: { page, limit, total, totalPages }
  - items: listado de medicos con latestVerification (o null)

## 2) POST /v1/admin/doctors/:doctorId/doctor-verify
- Rol requerido: ADMIN
- Proposito: verificar o rechazar medico por REThUS.
- Path params:
  - doctorId: ObjectId de Mongo
- Body soporta 2 formatos:

Formato completo:
- programType: DOCTORATE | UNDEFINED | PROFESSIONAL_TECHNICAL | MASTERS | TECHNOLOGY | SPECIALIZATION | UNIVERSITY | ASSISTANT
- titleObtainingOrigin: LOCAL | FOREIGN
- professionOccupation: string
- startDate: fecha ISO string
- rethusState: VALID | EXPIRED | PENDING
- administrativeAct: string
- reportingEntity: string
- evidenceUrl (opcional): url
- notes (opcional): string

Formato compacto:
- action: APPROVE | REJECT
- evidenceUrl (opcional): url
- notes (opcional): string

Mapeo del formato compacto:
- APPROVE -> rethusState VALID -> doctorStatus VERIFIED
- REJECT -> rethusState EXPIRED -> doctorStatus REJECTED

Respuesta 201:
- doctorId
- doctorStatus
- checkedAt
- verification: { programType, titleObtainingOrigin, professionOccupation, startDate, rethusState, administrativeAct, reportingEntity, checkedBy, evidenceUrl?, notes? }

Errores frecuentes:
- 400 doctorId invalido o body invalido
- 403 token sin rol ADMIN
- 404 medico no encontrado

## 3) POST /v1/admin/doctors/:doctorId/rethus-verify (actualizado)
- Rol requerido: ADMIN
- Proposito: misma logica que doctor-verify.
- Diferencia en esta rama: ya acepta tambien el formato compacto (action APPROVE/REJECT).
- Respuesta y errores: mismos que endpoint anterior.

## 4) GET /v1/admin/users
- Rol requerido: ADMIN
- Proposito: listar usuarios (todos los roles) con paginacion y filtro por texto.
- Query params:
  - role (opcional): PATIENT | DOCTOR | ADMIN
  - search (opcional)
  - page (opcional, default 1)
  - limit (opcional, default 20, max 100)
- Respuesta 200:
  - pagination: { page, limit, total, totalPages }
  - items: [{ id, role, firstName, lastName, email, isActive, createdAt, updatedAt, ...campos por rol }]

Campos por rol en items:
- PATIENT: birthDate, gender
- DOCTOR: specialty, doctorStatus, personalId, professionalLicense, phoneNumber
- ADMIN: solo base

## 5) GET /v1/admin/users/:role
- Rol requerido: ADMIN
- Proposito: listar usuarios filtrando por rol desde path.
- Path params:
  - role: PATIENT | DOCTOR | ADMIN
- Query params:
  - search, page, limit
- Respuesta 200:
  - mismo contrato que GET /v1/admin/users

## 6) GET /v1/admin/users/:role/:userId
- Rol requerido: ADMIN
- Proposito: obtener detalle de un usuario por rol y id.
- Path params:
  - role: PATIENT | DOCTOR | ADMIN
  - userId: ObjectId
- Respuesta 200:
  - objeto usuario en formato unificado

Errores frecuentes:
- 400 userId invalido o role invalido
- 404 usuario no encontrado

## 7) PATCH /v1/admin/users/:role/:userId/active
- Rol requerido: ADMIN
- Proposito: activar/desactivar usuario.
- Path params:
  - role: PATIENT | DOCTOR | ADMIN
  - userId: ObjectId
- Body:
  - isActive: boolean
- Respuesta 200:
  - { id, role, isActive, updatedAt }

Comportamiento adicional:
- Si isActive = false, se revocan refresh sessions activas del usuario.

Errores frecuentes:
- 400 userId invalido o body invalido
- 404 usuario no encontrado

## 8) POST /v1/doctors/me/rethus-resubmit
- Rol requerido: DOCTOR
- Proposito: reenviar evidencia REThUS luego de rechazo.
- Body:
  - evidenceUrl (opcional): url
  - notes (opcional): string
- Respuesta 201:
  - doctorId
  - doctorStatus: PENDING
  - checkedAt
  - verification: { rethusState: PENDING, checkedBy, evidenceUrl?, notes? }

Regla de negocio clave:
- Solo funciona si el doctor esta en estado REJECTED.

Errores frecuentes:
- 400 si doctor no esta en REJECTED o body invalido
- 403 si no es DOCTOR
- 404 si el doctor no existe

## 9) POST /v1/admin/ai/health-check
- Rol requerido: ADMIN
- Proposito: ejecutar chequeo de salud de proveedor AI.
- Body: sin body
- Respuesta 201:
  - provider: string
  - model: string
  - status: up | down | disabled
  - latencyMs: number
  - checkedAt: ISO string
  - degraded: boolean
  - requestId: string
  - error (opcional): string

Notas para frontend:
- status=disabled no implica error HTTP; es respuesta funcional para UI de observabilidad.

## Recomendaciones de integracion frontend
1. Estandarizar una sola ruta para verificacion (doctor-verify o rethus-verify) y mantenerla fija en cliente.
2. Para paginacion, usar siempre page/limit y leer totalPages de respuesta.
3. En listados de usuarios, renderizar columnas dinamicas por rol.
4. Manejar 400/403/404 con mensajes de negocio en UI (no solo mensaje generico).
5. Para health-check AI, tratar status disabled/down como estado de servicio, no como crash del backend.
