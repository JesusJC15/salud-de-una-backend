## T-003-05 – Implementación del RedFlagsEngine para Medicina General

Implementar el motor centralizado de detección de red flags:
- Clase RedFlagsEngine con método estático evaluate(answers: TriageAnswer[], specialty: Specialty): RedFlag[].
- Catálogo de red flags Medicina General (mínimo 5, versionado en archivo JSON separado):
    · RF-MG-001: dolor torácico + dificultad respiratoria → CRITICAL
    · RF-MG-002: pérdida de consciencia o síncope → CRITICAL
    · RF-MG-003: fiebre > 39°C + rigidez de nuca → CRITICAL
    · RF-MG-004: dolor abdominal intenso de inicio súbito → CRITICAL
    · RF-MG-005: alteraciones visuales repentinas → WARNING
- El catálogo se carga desde apps/api/src/triage/rules/red-flags-mg.json para facilitar
  actualización sin modificar código.
- La función es pura (sin efectos secundarios) y testeable de forma aislada.
- Cobertura de pruebas unitarias >= 90%.
Ubicar en: apps/api/src/triage/engines/red-flags.engine.ts

Criterios de aceptación de la tarea:

El motor detecta correctamente cada uno de los 5 red flags de MG con sus respectivos síntomas disparadores.
La función retorna un array vacío cuando no hay combinaciones de riesgo.
El catálogo es modificable sin cambiar el código del motor.
Cobertura de pruebas >= 90% en CI.

## T-003-06 – Implementación del cuestionario de Medicina General y pantalla de triage en React Native

Implementar el flujo de triage de Medicina General en la app móvil:

TriageSelectionScreen:
- Pantalla de selección de especialidad (Medicina General / Odontología).
- Botón "Iniciar Triage" llama a POST /v1/triage/sessions con la especialidad seleccionada.
- Al éxito, navega a TriageQuestionnaireScreen.

TriageQuestionnaireScreen (Medicina General):
- Muestra las preguntas del cuestionario una a una con barra de progreso (paso X de N).
- Tipos de respuesta soportados: selección única, selección múltiple, escala numérica (1-10).
- Botón "Siguiente" guarda la respuesta actual (POST /v1/triage/sessions/{id}/answers).
- Botón "Finalizar y analizar" (visible solo cuando isComplete=true) dispara el análisis.

TriageResultScreen:
- Muestra la prioridad resultante con color: verde (LOW), amarillo (MODERATE), rojo (HIGH).
- Lista de red flags detectados con su descripción.
- Para prioridad HIGH: banner de advertencia con recomendación de atención urgente.
- Botón "Ver mi caso en consultas" navega al listado de consultas del paciente.

Ubicar en: apps/mobile/src/screens/triage/

Criterios de aceptación de la tarea:

El flujo completo (selección → cuestionario → resultado) funciona sin errores.
La barra de progreso refleja el avance correcto.
El banner HIGH se muestra correctamente cuando la prioridad es HIGH.
La app no crashea con ninguna respuesta válida del backend.
Los errores del backend se muestran con mensajes comprensibles al usuario.


## T-003-07 – Implementación del GuardrailService para respuestas IA

Implementar el servicio de guardrail para respuestas del modelo IA:
- Clase GuardrailService con método check(text: string): { safe: boolean, violations: string[] }.
- Lista de términos y patrones prohibidos (versionada en apps/api/src/triage/rules/guardrail-rules.json):
    · Términos de diagnóstico: "diagnóstico de", "padece de", "tiene [enfermedad]", etc.
    · Términos de prescripción: "tomar [medicamento]", "administrar", "recetar", etc.
    · Patrones de afirmación clínica: "es [condición médica]", "sufre de", etc.
- Si safe=false: registrar alerta en log estructurado con nivel WARN, los violations encontrados
  y el correlation ID de la sesión.
- El GuardrailService es independiente del modelo IA; puede reutilizarse en otros módulos.
Ubicar en: apps/api/src/triage/services/guardrail.service.ts

Criterios de aceptación de la tarea:

El servicio detecta correctamente textos con lenguaje de diagnóstico (al menos 10 casos de prueba).
El servicio clasifica como safe textos con lenguaje de priorización/urgencia sin diagnóstico.
Cada violación queda registrada en el log con el correlation ID.


## T-003-08 – Pruebas unitarias del TriageService y RedFlagsEngine MG

Escribir pruebas unitarias con Jest:
TriageService:
- createSession: creación exitosa con specialty válida.
- createSession: conflicto con sesión IN_PROGRESS existente → ConflictException.
- saveAnswers: guardado exitoso; retorna isComplete correcto.
- saveAnswers: sesión no encontrada → NotFoundException.
- analyzeSession: sesión incompleta → UnprocessableEntityException.
- analyzeSession: red flag CRITICAL → override a prioridad HIGH.
- analyzeSession: guardrail activo → aiSummary descartado, guardrailApplied=true.

RedFlagsEngine:
- Cada uno de los 5 red flags de MG: verificar detección correcta.
- Combinación sin red flags → array vacío.
- Combinación con múltiples red flags → todos retornados correctamente.

GuardrailService:
- Texto con diagnóstico → safe=false con violations.
- Texto con prioridad/urgencia → safe=true.

Cobertura mínima objetivo: 80% de TriageService, 90% de RedFlagsEngine.
Ubicar en: apps/api/src/triage/triage.service.spec.ts y red-flags.engine.spec.ts

Criterios de aceptación de la tarea:

Todos los tests pasan en CI.
Cobertura >= 80% TriageService, >= 90% RedFlagsEngine.
No hay dependencias reales de base de datos ni de API IA en estas pruebas.

## T-003-09 – Pruebas de integración de los endpoints de triage MG

Pruebas de integración con supertest + MongoMemoryServer (Gemini mockeado):
- POST /v1/triage/sessions con specialty=GENERAL_MEDICINE → 201 con sessionId y preguntas.
- POST /v1/triage/sessions con sesión IN_PROGRESS existente → 409.
- POST /v1/triage/sessions/{id}/answers con respuestas válidas → 200 con isComplete.
- POST /v1/triage/sessions/{id}/answers con sessionId inexistente → 404.
- POST /v1/triage/sessions/{id}/analyze con sesión completa → 200 con prioridad y redFlags.
- POST /v1/triage/sessions/{id}/analyze: mock de Gemini retorna diagnóstico → guardrail activo.
- POST /v1/triage/sessions/{id}/analyze: mock activa RF-MG-001 → prioridad=HIGH.
- POST /v1/triage/sessions/{id}/analyze con sesión incompleta → 422.
Ubicar en: apps/api/test/triage-mg.e2e-spec.ts

Criterios de aceptación de la tarea:

Todos los tests de integración pasan en CI de forma aislada.
El mock de Gemini permite probar el guardrail sin llamadas reales a la API.
El flujo completo (crear → responder → analizar) se cubre end-to-end.


## T-003-10 – Documentación técnica del módulo de triage MG en Wiki

Actualizar la Wiki con:
- POST /v1/triage/sessions: request, response 201, errores 400/409.
- POST /v1/triage/sessions/{id}/answers: request, response 200 con isComplete, errores 400/404.
- POST /v1/triage/sessions/{id}/analyze: request, response 200 con prioridad y redFlags, errores 404/422.
- Contrato completo del objeto TriageSession con todos los campos.
- Catálogo de red flags de Medicina General v1.
- Política de guardrail: qué se filtra, cómo se registra, cómo se gestiona el resultado.
- Referencia a HU-003 y al sprint de implementación.

Criterios de aceptación de la tarea:

La Wiki refleja los contratos reales de los endpoints implementados.
Un nuevo desarrollador puede implementar un cliente del triage sin leer el código fuente.
La política de guardrail es comprensible para el equipo de producto y clínico.