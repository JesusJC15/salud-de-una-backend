---
name: saluddeuna-backlog-hu003
description: Project context skill for HU-003 — AI-guided Triage (General Medicine). Use when planning, implementing, or reviewing the triage feature to obtain the validated product purpose, API contracts, workflows, DoR/DoD, guardrails (no-diagnosis), SLO (<15s analysis), required data/env (MongoDB dev, Gemini API key or mock, RAG corpus), testing expectations, and integration guidance for backend, mobile and QA teams.
---

# HU-003 — Skill Playbook: Triage Guiado por IA (Medicina General)

**Fecha:** 2026-04-05  
**Repo(s):** Backend + Wiki (y luego App Paciente RN; web no aplica)  
**Historia (fuente de verdad):** HU-003 – Triage Guiado por IA para Medicina General (E2, F2.1)  
**Prioridad:** Must — **Estimación:** 8 SP  
**Restricción clave:** *No diagnóstico / no prescripción* (guardrail obligatorio)

---

## 0) Objetivo del skill

Implementar el flujo completo de triage de Medicina General:

1) Crear sesión triage  
2) Guardar respuestas estructuradas (máx 10 preguntas)  
3) Ejecutar análisis (Gemini + RAG + RedFlagsEngine) en < 15s  
4) Responder prioridad + red flags **sin lenguaje diagnóstico**  
5) Crear caso automáticamente en la **cola médica** con esa prioridad  
6) Persistir sesión en MongoDB con estado `COMPLETED` o `FAILED`

Este documento se debe usar como checklist permanente en desarrollo, QA y PRs.

---

## 1) Contrato funcional (no cambiar sin decisión de equipo)

### Endpoints v1 requeridos (backend)
- `POST /v1/triage/sessions`
- `POST /v1/triage/sessions/{id}/answers`
- `POST /v1/triage/sessions/{id}/analyze`

### Reglas MVP
- Máximo 10 preguntas.
- Respuestas **solo**: selección múltiple o escala numérica (sin texto libre).
- Guardrail obligatorio: no retornar ni persistir lenguaje de diagnóstico/prescripción.
- Si análisis falla: sesión queda `FAILED` con mensaje de error.
- `COMPLETED` es requisito para que E4 (ClinicalSummary) consuma la sesión.

### Resultado esperado del analyze
- `priority`: `LOW | MODERATE | HIGH`
- `redFlags`: lista estructurada (catálogo v1)
- `nextSteps`: recomendaciones genéricas (no diagnóstico)

---

## 2) Escenarios Gherkin (deben guiar pruebas)

### Scenario: Triage principal con priorización
Given un paciente autenticado en Medicina General  
When responde el cuestionario guiado completo  
Then el sistema genera prioridad LOW, MODERATE o HIGH  
And guarda evidencia de síntomas y factores de riesgo  
And el caso entra en la cola médica con esa prioridad

### Scenario: Triage alterno incompleto
Given un paciente que abandona el cuestionario  
When intenta enviar respuestas incompletas  
Then el sistema solicita completar campos obligatorios  
And no ejecuta análisis de prioridad

### Scenario: Guardrail de no-diagnóstico activo
Given un cuestionario completado con síntomas que podrían inducir diagnóstico  
When el motor IA procesa las respuestas  
Then la respuesta no contiene lenguaje de diagnóstico ni prescripción  
And el resultado solo describe nivel de urgencia y síntomas reportados

### Scenario: Tiempo de análisis dentro del SLO
Given una sesión de triage completada  
When se dispara el análisis con POST /v1/triage/sessions/{id}/analyze  
Then el sistema retorna la respuesta en menos de 15 segundos  
And el log registra la latencia del análisis IA

---

## 3) Checklist de Definition of Ready (DoR)

- [ ] Historia Como/Quiero/Para OK
- [ ] E2 / F2.1 confirmados
- [ ] Must (MoSCoW)
- [ ] Gherkin principal + alternos documentados
- [ ] Dependencias: HU-001 lista (auth paciente)
- [ ] Estimación 8 SP acordada
- [ ] Ambientes listos: MongoDB dev, API key Gemini dev, corpus RAG base
- [ ] Riesgos: prompts iterativos y guardrail
- [ ] Guardrail acordado por el equipo
- [ ] Estructura del cuestionario MG v1 (máx 10) acordada
- [ ] Responsable validación funcional definido

---

## 4) Checklist de Definition of Done (DoD)

Backend:
- [ ] Endpoints `/triage/sessions`, `/answers`, `/analyze` implementados
- [ ] Integración IA (Gemini + RAG) con prompts versionados en repo
- [ ] Guardrail no-diagnóstico implementado y probado
- [ ] RedFlagsEngine MG implementado con catálogo v1
- [ ] Sesión persistida en MongoDB con contrato ClinicalSummary
- [ ] Unit tests TriageService >= 80% y verdes
- [ ] Integration tests de los 3 endpoints verdes
- [ ] Logs de auditoría: correlation_id, specialty, priority, latency_ms
- [ ] SLO < 15s verificado (mín. 10 ejecuciones en test env)

Mobile RN:
- [ ] Pantalla de triage paso a paso con barra de progreso
- [ ] Manejo de HIGH: mensaje destacado + opción contactar médico

Doc:
- [ ] Wiki actualizada (endpoints, contrato, política guardrail)
- [ ] Demo aprobada por el equipo

---

## 5) Plan de ejecución por tareas (orden recomendado)

### T1 — Alinear contrato y estados (diseño rápido)
**Entregable:** contrato JSON + estados + enums definidos.

- Definir estados de sesión: `DRAFT | IN_PROGRESS | COMPLETED | FAILED`
- Definir `priority`: `LOW | MODERATE | HIGH`
- Definir catálogo mínimo de red flags MG v1 (ej: dolor torácico, disnea severa, signos neurológicos focales, etc. en formato estructurado)
- Definir estructura de preguntas MG (máx 10) y tipo de respuesta (choice/scale)

**Criterio de salida:** documento de contrato + enums aprobados.

---

### T2 — Persistencia MongoDB: TriageSession schema (backend)
**Entregable:** `triage/schemas/triage-session.schema.ts`

Campos mínimos:
- `patientId`
- `specialty = GENERAL_MEDICINE`
- `status`
- `questionsVersion`
- `answers[]` (estructurado: questionId + selectedOptionIds | numericValue)
- `analysis` (priority, redFlags, nextSteps, aiLatencyMs, providerMetadata)
- `error` (si FAILED)
- timestamps

**Criterio de salida:** schema + índices + tests unitarios de mapeo.

---

### T3 — Endpoint POST /v1/triage/sessions (backend)
**Entregable:** crea sesión y retorna `sessionId` + `questionnaire` (o al menos metadata).

- Autenticación requerida (paciente)
- Valida que specialty sea Medicina General
- Inicializa status `IN_PROGRESS`
- Retorna cantidad total de preguntas (para progreso)

**Criterio de salida:** integration test “create session”.

---

### T4 — Endpoint POST /v1/triage/sessions/{id}/answers (backend)
**Entregable:** guarda respuestas por pasos.

- Valida que la sesión pertenezca al paciente (ownership)
- Valida formato (sin texto libre)
- Valida completitud por paso o al final (según contrato)
- No permite `analyze` si faltan obligatorias

**Criterio de salida:** integration test “answers incompletas -> 400”.

---

### T5 — RedFlagsEngine MG (backend)
**Entregable:** motor determinístico (reglas) que produce red flags + severidad.

- Input: answers estructuradas
- Output: `redFlags[]` (id, label, severity, evidence)

**Criterio de salida:** unit tests por regla.

---

### T6 — IA Orchestrator (Gemini + RAG) + Prompts versionados (backend)
**Entregable:** servicio IA que produce resumen no-diagnóstico.

- Input: answers + contexto RAG (si aplica)
- Output: explicación neutral del nivel de urgencia + nextSteps
- Prompts versionados en repo (carpeta `src/triage/prompts/` o similar)
- Timeouts: hard limit < 15s (configurable)

**Criterio de salida:** mock de proveedor en tests + medición de latency.

---

### T7 — Guardrail no-diagnóstico (backend)
**Entregable:** filtro/validador que:
- inspecciona respuesta IA
- elimina/bloquea frases de diagnóstico/prescripción
- **prohíbe persistir** texto prohibido

Estrategia mínima MVP:
- Lista de términos prohibidos (diagnóstico/prescripción) + regex
- Post-procesamiento + fallback seguro (“No podemos dar diagnóstico… prioridad… siguientes pasos…”)

**Criterio de salida:** tests con ejemplos “induce diagnóstico” y verificación de sanitización.

---

### T8 — Endpoint POST /v1/triage/sessions/{id}/analyze (backend)
**Entregable:** ejecuta pipeline:
1) Validar sesión completa  
2) RedFlagsEngine  
3) IA Orchestrator  
4) Guardrail  
5) Determinar `priority` final (reglas pueden elevar a HIGH)  
6) Guardar `analysis` y set `COMPLETED`  
7) Crear caso en cola médica (consultations)

**Criterio de salida:** integration test “analyze ok -> COMPLETED” + “analyze falla -> FAILED”.

---

### T9 — Crear caso en cola médica (integración consultations)
**Entregable:** persistir “case” consultable por `GET /v1/consultations/queue`.

- Definir entidad/colección `consultations` (si no existe) o estructura equivalente.
- Debe guardar: patientId, triageSessionId, priority, status, timestamps.
- La cola debe ordenar por prioridad y antigüedad (si aplica).

**Criterio de salida:** integration test: after analyze, queue devuelve item.

---

### T10 — Observabilidad: logs + métricas mínimas
**Entregable:** logs estructurados:
- `endpoint_or_event = triage.session.created | triage.answers.saved | triage.analyze.completed | triage.analyze.failed`
- `correlation_id`, `latency_ms`, `priority`, `specialty`

**Criterio de salida:** verificación en logs de test.

---

### T11 — App Paciente (React Native) (cuando aplique)
**Entregable:** UI triage MG paso a paso:
- progreso X/Y
- opciones (multi) y escala
- submit por paso
- pantalla resultado con HIGH destacado

**Criterio de salida:** demo end-to-end.

---

## 6) Políticas innegociables (guardrails)

- No se retorna diagnóstico ni prescripción.
- No se guarda en DB texto con lenguaje diagnóstico.
- Solo se retorna urgencia y siguiente paso genérico.
- Límite 10 preguntas.
- Sin texto libre MVP.

---

## 7) Evidencia requerida en PRs

Cada PR relacionado a HU-003 debe:
- referenciar este skill (link)
- listar tareas cubiertas (T1..T11)
- adjuntar resultados de tests (unit + integration)
- declarar cambios en contrato/endpoints

---

## 8) Notas de implementación (para evitar deuda)
- Separar: `TriageController` -> `TriageService` (sin lógica en controller)
- DTOs con class-validator + ValidationPipe global
- Timeouts robustos al proveedor IA
- `FAILED` siempre persistido con causa “segura” para el usuario (sin detalles sensibles)

---
**Fin del skill.**