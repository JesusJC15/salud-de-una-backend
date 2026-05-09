# Knowledge Seeds — Batch 2

## Objetivo

Expandir el corpus inicial hacia dominios de alto valor clínico:

- salud mental
- pediatría respiratoria
- ginecología / obstetricia
- diarrea aguda pediátrica
- dolor / red flags sindrómicos
- cardiovascular agudo

Este lote está pensado para cargarse **después** del batch 1, cuando ya exista:

1. flujo de aprobación estable
2. revisión de chunks
3. primeras trazas RAG reales

## Archivo principal

Usar:

- [seed-manifest-batch-2.json](C:/Users/jesjc/SaludDeUna/salud-de-una-backend/docs/knowledge-seeds/seed-manifest-batch-2.json)

## Orden recomendado de carga

1. conducta suicida
2. prevención del suicidio para superficie paciente
3. neumonía / bronquiolitis pediátrica
4. asma pediátrica
5. enfermedad diarreica aguda
6. EDA primera infancia
7. embarazo, parto y puerperio
8. ITS y VIH en embarazo
9. síndrome coronario agudo
10. guía integral de dolor

## Estrategia por dominio

### Salud mental

Prioridad alta por riesgo clínico y valor para triage.

- usar la GPC de conducta suicida para `STAFF`
- usar la página pública de prevención para `PATIENT`
- esto debe quedar detrás de validación estricta y abstención segura

### Pediatría respiratoria

Muy útil para motivos de consulta frecuentes.

- neumonía / bronquiolitis para `TRIAGE` y `PATIENT_EDUCATION`
- asma para `TRIAGE`, `URGENT_CARE` y `CLINICAL_SUMMARY`

### Ginecología / obstetricia

Prioridad clínica alta por riesgos maternos y obstétricos.

- usar guías de embarazo, parto y puerperio para `STAFF`
- no mezclar con contenido demasiado general de salud sexual si no aporta a recuperación clínica

### Dolor y red flags

Usar estos documentos como soporte sindrómico, no como reemplazo de diagnóstico.

- dolor abdominal
- dolor torácico
- cefalea
- signos de alarma por intensidad y contexto

## Reglas de aprobación extra

- en salud mental, aprobar solo después de revisar abstención y lenguaje no prescriptivo
- en embarazo y urgencias, revisar que los chunks no corten flujos críticos a la mitad
- en guías extensas, si el chunking sale ruidoso, reprocesar y revisar antes de aprobar

## Riesgos conocidos

- algunas páginas públicas son mejores para `PATIENT_EDUCATION` que para `CLINICAL_SUMMARY`
- las guías de dolor pueden ser amplias y heterogéneas; conviene revisarlas por chunks antes de aprobar
- documentos obstétricos extensos pueden requerir upload manual del PDF en vez de URL directa
