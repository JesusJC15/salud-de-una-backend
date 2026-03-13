# README - src/notifications/schemas

## Objetivo

Modelos Mongoose persistentes, indices y constraints del modulo.

## Archivos actuales

- notification.schema.ts

## Dependencias relacionadas

- Modulo padre relacionado
- common (si aplica)
- config/auth segun necesidad

## Responsabilidades y limites

- Delimitar alcance tecnico de la carpeta.
- Mantener contratos y fronteras claras con otros modulos.
- Reducir errores de implementacion por falta de contexto.

## Que debe ir aqui

- Schemas con timestamps e indices relevantes.
- Restricciones de unicidad y defaults consistentes.
- Alineacion con DTOs y enums del dominio.

## Que no debe ir aqui

- Validaciones HTTP o decorators de controller.
- Logica de autorizacion.
- Servicios/controladores del dominio.

## Recomendaciones

- Actualizar este README cuando cambie contrato, limite o flujo.
- Agregar al menos un ejemplo util por cambio importante.
- Mantener texto accionable y evitar contenido vacio.

## Matriz de endpoints (si aplica)

- No aplica en este nivel. Si hay endpoints, documentarlos en el modulo padre.

## Ejemplos de codigo/payload

```ts
@Schema({ timestamps: true })
export class ExampleSchema {}
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
