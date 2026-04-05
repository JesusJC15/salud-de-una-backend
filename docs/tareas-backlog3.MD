
the markdown file and the skill saluddeuna-backlog-hu003. Create a step-by-step execution plan and implement it incrementally. Focus on one task at a time (schema → endpoints → services), validate each step, and ensure DTOs, guards, and business rules strictly match the specification.

# Triage Module – Technical Specification (HU003)

## T-003-01 – Diseño del modelo TriageSession en MongoDB

Crear el schema Mongoose para el modelo `TriageSession` con los siguientes campos:

- `_id`: ObjectId generado automáticamente
- `patientId`: referencia a Patient, requerido
- `specialty`: String, enum ['GENERAL_MEDICINE', 'DENTISTRY'], requerido
- `status`: String, enum ['IN_PROGRESS', 'COMPLETED', 'FAILED'], default 'IN_PROGRESS'
- `answers`: Array de objetos con:
  - `questionId`
  - `questionText`
  - `answerValue`
  - `answeredAt`
- `analysis`: Objeto opcional con:
  - `priority`: enum ['LOW', 'MODERATE', 'HIGH']
  - `redFlags`: Array de RedFlag
  - `aiSummary`: String opcional, sin diagnósticos
  - `analysisDurationMs`: Number
  - `guardrailApplied`: Boolean
- `completedAt`: Date opcional
- `createdAt`, `updatedAt`: timestamps automáticos

### Sub-documento RedFlag

- `code`: String requerido (ej: RF-MG-001)
- `specialty`: enum ['GENERAL_MEDICINE', 'DENTISTRY']
- `severity`: enum ['CRITICAL', 'WARNING', 'INFO']
- `evidence`: String

### Requerimientos adicionales

- Índice compuesto en `(patientId, status)`
- Ubicación: `apps/api/src/triage/schemas/triage-session.schema.ts`

### Criterios de aceptación

- Schema exportado correctamente
- Estado por defecto: IN_PROGRESS
- Validación correcta de enums en answers y redFlags
- Índice verificado en MongoDB local

---

## T-003-02 – Endpoint POST /v1/triage/sessions

### Configuración

- Módulo: TriageModule
- Ruta: POST /v1/triage/sessions
- Seguridad: JwtAuthGuard + rol PACIENTE

### DTO

CreateTriageSessionDto {
  specialty: 'GENERAL_MEDICINE' | 'DENTISTRY'
}

### Lógica

1. Validar que no exista sesión IN_PROGRESS para el mismo paciente y especialidad  
   Si existe: HTTP 409  
2. Crear sesión con status IN_PROGRESS  
3. Retornar HTTP 201 con:
   - sessionId
   - specialty
   - status
   - questions[]  

El campo `questions[]` proviene del repositorio de preguntas

### Ubicación

`apps/api/src/triage/`

### Criterios de aceptación

- Retorna 201 con datos correctos
- Retorna 409 si ya existe sesión activa
- Retorna 400 si specialty inválido
- Seguridad: 401 sin token, 403 sin rol adecuado

---

## T-003-03 – Endpoint POST /v1/triage/sessions/{sessionId}/answers

### Configuración

- Ruta: POST /v1/triage/sessions/{sessionId}/answers
- Seguridad: JwtAuthGuard + rol PACIENTE

### DTO

SaveTriageAnswersDto {
  answers: [{ questionId, answerValue }]
}

### Lógica

1. Validar existencia y propiedad de la sesión → 404  
2. Validar status IN_PROGRESS → 400 si no  
3. Validar questionIds contra la especialidad  
4. Actualizar answers  
5. Retornar HTTP 200:
   - sessionId
   - answersCount
   - isComplete  

Permite envíos parciales

### Ubicación

`apps/api/src/triage/`

### Criterios de aceptación

- Actualización correcta de respuestas
- 404 si no existe o no pertenece al paciente
- 400 si estado inválido
- isComplete correcto

---

## T-003-04 – Endpoint POST /v1/triage/sessions/{sessionId}/analyze

### Configuración

- Ruta: POST /v1/triage/sessions/{sessionId}/analyze
- Seguridad: JwtAuthGuard + rol PACIENTE

### Lógica

1. Validar sesión completa → HTTP 422 si no  
2. Ejecutar RedFlagsEngine.evaluate(answers, specialty) → redFlags[]  
3. Si specialty = GENERAL_MEDICINE:
   - Ejecutar GeminiService.analyzeTriage(answers, redFlags)  
4. Aplicar guardrail:
   - Si detecta diagnóstico o prescripción → descartar aiSummary  
   - Marcar guardrailApplied = true  
5. Calcular prioridad:
   - Si hay redFlag CRITICAL → HIGH  
   - Si hay redFlag WARNING y prioridad base < MODERATE → MODERATE  
   - En otro caso → prioridad base  
6. Actualizar sesión:
   - status = COMPLETED  
   - analysis completo  
7. Crear documento Consultation en estado PENDING  
8. Retornar HTTP 200:
   - sessionId
   - priority
   - redFlags
   - message  

### Observabilidad

- Medir analysisDurationMs  
- Alertar si > 15000 ms  
- Registrar evento de auditoría completo  

### Ubicación

- `apps/api/src/triage/`
- `apps/api/src/triage/services/gemini-triage.service.ts`

### Criterios de aceptación

- Retorna prioridad válida y red flags  
- 422 si sesión incompleta  
- Override HIGH correcto  
- Guardrail bloquea contenido inválido  
- Sesión queda en COMPLETED  
- Consultation creada automáticamente  
- Latencia registrada y alertada  

---

## Resumen

Se define el modelo de datos, endpoints y lógica completa del flujo de triage, incluyendo persistencia, validaciones, análisis con IA, motor de reglas, seguridad y observabilidad.

---