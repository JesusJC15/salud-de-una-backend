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

### 3) Save answers (advance flow)

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

### 4) Cancel active session

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

### 5) Analyze completed answers

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

## Session statuses

- `IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `EXPIRED`
- `FAILED`

Database integrity: one unique `IN_PROGRESS` session per `patientId + specialty` (partial unique index).
