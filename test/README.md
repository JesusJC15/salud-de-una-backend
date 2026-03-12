# README - test

## Objetivo

Estrategia E2E para validar comportamiento real de la API y contratos HTTP.

## Archivos actuales

- e1.e2e-spec.ts
- jest-e2e.json

## Dependencias relacionadas

- Supertest + mongodb-memory-server
- jest-e2e config

## Responsabilidades y limites

- Delimitar alcance tecnico de la carpeta.
- Mantener contratos y fronteras claras con otros modulos.
- Reducir errores de implementacion por falta de contexto.

## Que debe ir aqui

- Pruebas E2E por flujo critico y por rol.
- Casos de error por permisos y validacion.
- Setup/teardown reproducible.

## Que no debe ir aqui

- Dependencias externas reales en E2E.
- Asserts ambiguos sin validar contrato.
- Fixtures gigantes no mantenibles.

## Recomendaciones

- Actualizar este README cuando cambie contrato, limite o flujo.
- Agregar al menos un ejemplo util por cambio importante.
- Mantener texto accionable y evitar contenido vacio.

## Matriz de endpoints (si aplica)

- No aplica en este nivel. Si hay endpoints, documentarlos en el modulo padre.

## Ejemplos de codigo/payload

```ts
// ejemplo minimo de referencia
export class Example {}
```

## Errores comunes y mitigacion

- Cambiar contrato sin actualizar README y pruebas.
- Dejar secciones genericas sin contexto.
- No revisar impacto hacia carpetas consumidoras.

## Checklist de PR

- [ ] Se actualizo README si hubo cambio de alcance/contrato.
- [ ] Secciones obligatorias completas.
- [ ] Riesgos y mitigaciones documentados.
- [ ] Comandos de verificacion ejecutados o validados.

## Comandos de pruebas/lint

- `npm run lint`
- `npm run test -- --runInBand`
- `npm run test:e2e -- --runInBand`
