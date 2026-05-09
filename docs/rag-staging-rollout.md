# Sprint 5 RAG — Staging Rollout

## Objetivo

Habilitar el RAG clínico en staging usando la infraestructura actual:

- `MongoDB Atlas`
- `Atlas Vector Search`
- `GridFS`
- `Gemini`
- `Redis`

## Variables mínimas de entorno

Usar estas variables en staging sobre el backend:

```env
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=<tu_api_key_gemini>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

RAG_SUMMARY_ENABLED=true
RAG_TRIAGE_ENABLED=false
RAG_PATIENT_EVIDENCE_ENABLED=false

RAG_TOP_K=8
RAG_MAX_CONTEXT_CHUNKS=10
RAG_EMBEDDING_DIMENSIONS=768
RAG_VECTOR_INDEX_NAME=salud_de_una_knowledge_chunks_vector_v1
```

Rollout recomendado:

1. `RAG_SUMMARY_ENABLED=true`
2. `RAG_TRIAGE_ENABLED=false`
3. `RAG_PATIENT_EVIDENCE_ENABLED=false`

Despues de validar trazas reales:

1. activar `RAG_TRIAGE_ENABLED=true`
2. mantener `RAG_PATIENT_EVIDENCE_ENABLED=false`
3. solo al final evaluar `RAG_PATIENT_EVIDENCE_ENABLED=true`

## Indice Atlas Vector Search

Nombre recomendado del indice:

```text
salud_de_una_knowledge_chunks_vector_v1
```

Coleccion:

```text
knowledgechunks
```

Nota:

- Mongoose normalmente pluraliza `KnowledgeChunk` como `knowledgechunks`.
- Si tu cluster ya usa otro nombre real de coleccion, crea el indice sobre esa coleccion real.

JSON del indice:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "reviewStatus"
    },
    {
      "type": "filter",
      "path": "specialty"
    },
    {
      "type": "filter",
      "path": "audience"
    },
    {
      "type": "filter",
      "path": "useCases"
    },
    {
      "type": "filter",
      "path": "country"
    }
  ]
}
```

## Por que 768 dimensiones

Se usa `768` por defecto porque:

- reduce costo de almacenamiento vectorial
- reduce latencia de retrieval
- es consistente con las recomendaciones oficiales de Gemini embeddings
- evita indexar por defecto a `3072` dimensiones cuando no es necesario para esta fase

Referencia oficial de Gemini embeddings:

- [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings?authuser=0&hl=es-419)

La documentacion oficial indica que `gemini-embedding-001` produce `3072` dimensiones por defecto, pero recomienda `768`, `1536` o `3072` usando `output_dimensionality`.

## Orden de activacion

1. desplegar backend con las variables de arriba
2. crear el indice vectorial en Atlas
3. verificar que `/v1/ready` y `/v1/health` sigan sanos
4. ingresar a `/admin/knowledge`
5. crear al menos una fuente
6. cargar 5-10 documentos reales por texto, URL o archivo
7. revisar chunks generados
8. aprobar contenido solo con un `DOCTOR VERIFIED`
9. asignar una consulta real en staging
10. generar resumen clinico y revisar citas
11. inspeccionar `dashboard/rag-metrics` y `dashboard/rag-traces`

## Checklist de validacion

- el documento queda en `READY_FOR_REVIEW` despues de ingesta exitosa
- el documento `APPROVED` actualiza los chunks a `APPROVED`
- `rag-traces` muestra `selectedChunks`
- `consultations/:id` devuelve `clinicalSummaryCitations`
- el summary funciona con RAG cuando el flag esta activo
- si no hay evidencia, el sistema hace fallback seguro

## Comandos sugeridos

Backend:

```bash
npm run build
```

Web:

```bash
npm run build
```

## Riesgos conocidos de esta iteracion

- la ingesta sigue siendo sincrona
- PDFs escaneados sin texto no estan soportados
- el fallback local de retrieval existe por resiliencia, pero en produccion debe usarse el indice Atlas correctamente
- la calidad del sistema depende directamente del corpus aprobado inicial
