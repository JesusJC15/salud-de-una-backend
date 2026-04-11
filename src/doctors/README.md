# README - src/doctors

## Objetivo

Perfil y estado de doctor dentro de plataforma.

## Archivos actuales

- doctors.controller.ts
- doctors.module.ts
- doctors.service.ts

## Dependencias relacionadas

- doctors/dto y doctors/schemas
- admin (flujo verificacion)
- auth

## Responsabilidades y limites

- Delimitar alcance tecnico de la carpeta.
- Mantener contratos y fronteras claras con otros modulos.
- Reducir errores de implementacion por falta de contexto.

## Que debe ir aqui

- Artefactos propios de esta carpeta y su proposito.
- Contratos relevantes que impacten otros modulos.
- Notas de mantenimiento cuando una decision no sea obvia.

## Que no debe ir aqui

- Logica o archivos de otro dominio.
- Codigo temporal de depuracion sin fecha de retiro.
- Repetir reglas globales sin aportar contexto local.

## Recomendaciones

- Actualizar este README cuando cambie contrato, limite o flujo.
- Agregar al menos un ejemplo util por cambio importante.
- Mantener texto accionable y evitar contenido vacio.

## Matriz de endpoints (si aplica)

| Metodo | Ruta | Auth | Rol | Proposito |
| --- | --- | --- | --- | --- |
| GET | /v1/doctors/me | JWT | DOCTOR | Perfil doctor |
| POST | /v1/doctors/me/rethus-resubmit | JWT | DOCTOR | Reenviar evidencia REThUS tras rechazo |

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
