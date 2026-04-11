# Triage API Contracts

## Specialty enum (exact values)

- `GENERAL_MEDICINE`
- `ODONTOLOGY`

Any other value (for example `DENTISTRY`) returns HTTP 400 by global validation.

## Endpoints

### 1) Create session

`POST /v1/triage/sessions`

Request:

```json
{
  "specialty": "GENERAL_MEDICINE"
}
```

Success `201`:

```json
{
  "sessionId": "680f0493bba79f530f7486f1",
  "specialty": "GENERAL_MEDICINE",
  "status": "IN_PROGRESS",
  "questions": [
    {
      "questionId": "MG-Q1",
      "questionText": "Cual es tu sintoma principal?"
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

Nota: si el cliente requiere metadatos completos de preguntas (type, options, min/max/step), usar `GET /v1/triage/sessions/{sessionId}` como fuente oficial.

Conflict `409` (resume hint):

```json
{
  "statusCode": 409,
  "errorCode": "TRIAGE_SESSION_IN_PROGRESS",
  "specialty": "GENERAL_MEDICINE",
  "existingSessionId": "680f0493bba79f530f7486f1",
  "status": "IN_PROGRESS",
  "message": "Ya existe una sesion de triage en progreso para esta especialidad",
  "path": "/v1/triage/sessions",
  "timestamp": "2026-04-07T18:20:00.000Z",
  "correlation_id": "e65fd6f0-966d-4d67-9d0b-f0668f752b17"
}
```

### 2) Get active sessions

`GET /v1/triage/sessions/active`

Optional query filter:

`GET /v1/triage/sessions/active?specialty=GENERAL_MEDICINE`

Success `200`:

```json
{
  "items": [
    {
      "id": "680f0493bba79f530f7486f1",
      "specialty": "GENERAL_MEDICINE",
      "status": "IN_PROGRESS",
      "currentStep": 2,
      "totalSteps": 5,
      "currentQuestionId": "MG-Q2",
      "isComplete": false,
      "createdAt": "2026-04-07T18:18:00.000Z",
      "updatedAt": "2026-04-07T18:19:10.000Z"
    }
  ],
  "total": 1
}
```

### 3) Get session detail (resume/hydrate questionnaire)

`GET /v1/triage/sessions/{sessionId}`

Success `200`:

```json
{
  "id": "680f0493bba79f530f7486f1",
  "sessionId": "680f0493bba79f530f7486f1",
  "specialty": "GENERAL_MEDICINE",
  "status": "IN_PROGRESS",
  "isComplete": false,
  "currentQuestionId": "MG-Q2",
  "currentStep": 2,
  "totalSteps": 5,
  "totalQuestions": 5,
  "nextQuestionId": "MG-Q2",
  "questions": [
    {
      "id": "MG-Q1",
      "questionId": "MG-Q1",
      "title": "Sintoma principal",
      "questionText": "Que sintoma principal presentas hoy?",
      "description": "Selecciona el sintoma que describe mejor tu situacion.",
      "type": "SINGLE_CHOICE",
      "options": [
        {
          "id": "MG-Q1-HEADACHE",
          "label": "Dolor de cabeza"
        }
      ]
    },
    {
      "id": "MG-Q3",
      "questionId": "MG-Q3",
      "title": "Intensidad de sintomas",
      "questionText": "En una escala de 0 a 10, cual es la intensidad?",
      "type": "NUMERIC_SCALE",
      "minValue": 0,
      "maxValue": 10,
      "step": 1
    }
  ],
  "createdAt": "2026-04-07T18:18:00.000Z",
  "updatedAt": "2026-04-07T18:19:10.000Z"
}
```

Not found `404` (sesion inexistente o sin ownership):

```json
{
  "statusCode": 404,
  "message": "Sesion de triage no encontrada"
}
```

### 4) Save answers (advance flow)

`POST /v1/triage/sessions/{sessionId}/answers`

Request:

```json
{
  "answers": [
    { "questionId": "MG-Q1", "answerValue": "cefalea" },
    { "questionId": "MG-Q2", "answerValue": "2 dias" }
  ]
}
```

Success `200`:

```json
{
  "sessionId": "680f0493bba79f530f7486f1",
  "answersCount": 2,
  "isComplete": false,
  "totalQuestions": 5,
  "answeredCount": 2,
  "remainingQuestions": 3,
  "progressPercent": 40,
  "nextQuestionId": "MG-Q3"
}
```

### 5) Cancel active session

`PATCH /v1/triage/sessions/{sessionId}/cancel`

Success `200`:

```json
{
  "sessionId": "680f0493bba79f530f7486f1",
  "specialty": "GENERAL_MEDICINE",
  "status": "CANCELED",
  "canceledAt": "2026-04-07T18:20:00.000Z",
  "message": "Sesion de triage cancelada correctamente"
}
```

### 6) Analyze completed answers

`POST /v1/triage/sessions/{sessionId}/analyze`

Success `200`:

```json
{
  "sessionId": "680f0493bba79f530f7486f1",
  "priority": "MODERATE",
  "redFlags": [],
  "message": "Analisis de triage completado. Tu caso fue enviado a la cola medica.",
  "highPriorityAlert": false
}
```

Service unavailable `503` (error tecnico estable):

```json
{
  "statusCode": 503,
  "errorCode": "TRIAGE_ANALYSIS_DEPENDENCY_UNAVAILABLE",
  "specialty": "GENERAL_MEDICINE",
  "sessionId": "680f0493bba79f530f7486f1",
  "message": "No fue posible completar el analisis de triage en este momento"
}
```

Codigos tecnicos de analisis:

- `TRIAGE_ANALYSIS_DEPENDENCY_UNAVAILABLE`: dependencia externa de IA no disponible en analisis de Medicina General.
- `TRIAGE_ANALYSIS_RULESET_MISSING`: no existe ruleset de preguntas para la especialidad solicitada.

Resiliencia en Medicina General:

- Retry interno con backoff para errores transitorios del proveedor IA.
- Fallback a priorizacion por reglas si el error transitorio persiste tras reintentos.
- Si el fallo no es transitorio, la sesion pasa a `FAILED` y retorna `503`.

Campos adicionales para frontend en `200` de analyze:

- `analysisMode`: `AI_ASSISTED` o `RULE_BASED`.
- `noticeCode` opcional:
  - `IA_TEMPORARILY_UNAVAILABLE_RULE_BASED_FALLBACK`
  - `IA_NOT_IMPLEMENTED_RULE_BASED_FALLBACK`

Recomendacion UI:

- Si `analysisMode=RULE_BASED`, mostrar banner informativo no bloqueante:
  - "Tu analisis fue realizado con reglas clinicas. Puede variar cuando la IA este disponible."

## Session statuses

- `IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `EXPIRED`
- `FAILED`

Database integrity: one unique `IN_PROGRESS` session per `patientId + specialty` (partial unique index).
