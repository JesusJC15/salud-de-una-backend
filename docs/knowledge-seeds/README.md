# Knowledge Seeds — Corpus Inicial Staging

## Objetivo

Este paquete define un lote inicial de documentos para cargar en `/admin/knowledge`
durante la activacion de Sprint 5.

Cobertura inicial:

- `GENERAL_MEDICINE`
- `URGENT_CARE`
- `MEDICATION_SAFETY`

Prioridad:

1. normas y rutas oficiales Colombia
2. guias clinicas oficiales Colombia
3. seguridad de medicamentos INVIMA
4. contenido publico para explicacion al paciente

## Archivo principal

Usar:

- [seed-manifest.json](C:/Users/jesjc/SaludDeUna/salud-de-una-backend/docs/knowledge-seeds/seed-manifest.json)

Cada entrada ya viene mapeada a los campos del admin:

- `title`
- `authority`
- `sourceType`
- `specialty`
- `audience`
- `useCases`
- `country`
- `clinicalTags`
- `symptoms`
- `redFlags`
- `drugNames`
- `sourceUrl`

## Orden recomendado de carga

1. `MINSALUD - Manual metodológico RIAS`
2. `MINSALUD - Triage en servicios de urgencias`
3. `MINSALUD - Guía para manejo de urgencias Tomo I`
4. `MINSALUD - Guía clínica dengue`
5. `MINSALUD - Infección respiratoria aguda (IRA)`
6. `MINSALUD - Herramienta clínica primera infancia: IRA`
7. `MINSALUD - GPC hipertensión arterial primaria`
8. `INVIMA - Gestión de alertas sanitarias`
9. `INVIMA - Alertas sanitarias medicamentos y productos biológicos`

## Estrategia de carga

### 1. Cargar primero por URL

Aplicar cuando la URL responde bien desde el backend y el texto resultante sea limpio.

Recomendado para:

- páginas HTML de MINSALUD/INVIMA
- PDFs que descarguen directamente sin bloqueo

### 2. Si la URL no se procesa bien, usar upload de archivo

Aplicar cuando:

- la página sea demasiado navegacional
- el PDF requiera descarga manual
- el HTML tenga demasiado ruido

En ese caso:

1. descargar el PDF o HTML localmente
2. subirlo desde `/admin/knowledge`
3. revisar chunks
4. reprocesar si hace falta

## Reglas clínicas de aprobación

- `APPROVED` solo por `DOCTOR VERIFIED`
- no aprobar un documento si los chunks salen con texto roto
- no aprobar páginas índice o listados de navegación con poco contenido clínico
- preferir PDF/HTML específico sobre páginas catálogo

## Qué revisar antes de aprobar

1. chunks con contexto clínico entendible
2. títulos y secciones coherentes
3. ausencia de texto basura
4. especialidad correcta
5. `useCases` correctos
6. si aplica medicamentos, que no mezcle varias alertas sin contexto

## Notas operativas

- `INVIMA - Alertas sanitarias medicamentos y productos biológicos` funciona mejor como fuente viva para consultas recientes, pero puede producir chunks heterogéneos; úsala primero para `MEDICATION_SAFETY`, no como base principal de summaries.
- `MINSALUD - Triage` y `Guía para manejo de urgencias` son claves para `URGENT_CARE`.
- `Guía clínica dengue` aporta mucho valor para Colombia por prevalencia local y red flags.
- `IRA` + herramienta de primera infancia ayudan a explicaciones al paciente y soporte de triage respiratorio.

## Siguiente lote recomendado

Despues de validar el primer lote:

1. salud mental: conducta suicida y signos de alarma
2. EDA / gastroenteritis
3. asma / bronquiolitis pediatrica
4. infecciones de piel y partes blandas
5. cefalea / dolor toracico / dolor abdominal segun corpus disponible
