# README - src/doctors/dto

## Objetivo

Contratos DTO de request/response del modulo.

## Archivos actuales

- doctor-me.response.dto.ts
- rethus-resubmit.dto.ts

## Dependencias relacionadas

- Modulo padre relacionado
- common (si aplica)
- config/auth segun necesidad

## Responsabilidades y limites

- Delimitar alcance tecnico de la carpeta.
- Mantener contratos y fronteras claras con otros modulos.
- Reducir errores de implementacion por falta de contexto.

## Que debe ir aqui

- DTO por caso de uso con class-validator.
- Diferenciar claramente request DTO y response DTO.
- Campos opcionales solo con justificacion funcional.

## Que no debe ir aqui

- Logica de negocio o acceso a DB.
- Reuso forzado de DTO en semanticas distintas.
- Tipos any sin necesidad.

## Recomendaciones

- Actualizar este README cuando cambie contrato, limite o flujo.
- Agregar al menos un ejemplo util por cambio importante.
- Mantener texto accionable y evitar contenido vacio.

## Matriz de endpoints (si aplica)

- No aplica en este nivel. Si hay endpoints, documentarlos en el modulo padre.

## Ejemplos de codigo/payload

```ts
export class UpdateExampleDto {
  @IsString()
  field!: string;
}
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
