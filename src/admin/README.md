# README - src/admin

## Objetivo

Revision y verificacion de medicos por administradores (flujo REThUS).

## Archivos actuales

- admin.controller.ts
- admin.module.ts
- admin.service.spec.ts
- admin.service.ts

## Dependencias relacionadas

- doctors (estado y verificacion)
- notifications (avisos de cambio de estado)
- common/guards + roles

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

| Metodo | Ruta                                      | Auth | Rol   | Proposito                                                    |
| ------ | ----------------------------------------- | ---- | ----- | ------------------------------------------------------------ |
| GET    | /v1/admin/doctors                         | JWT  | ADMIN | Listar medicos (incluye pendientes)                          |
| GET    | /v1/admin/doctors/review                  | JWT  | ADMIN | Alias de listado de revision para compatibilidad front       |
| POST   | /v1/admin/doctors/:doctorId/doctor-verify | JWT  | ADMIN | Endpoint canonical para aprobar/rechazar verificacion REThUS |
| POST   | /v1/admin/doctors/:doctorId/rethus-verify | JWT  | ADMIN | Alias de compatibilidad para el flujo REThUS                 |
| GET    | /v1/admin/users                           | JWT  | ADMIN | Listar usuarios por rol/search/paginacion                    |
| GET    | /v1/admin/users/:role                     | JWT  | ADMIN | Listar usuarios de un rol especifico                         |
| GET    | /v1/admin/users/:role/:userId             | JWT  | ADMIN | Obtener detalle de usuario por rol                           |
| PATCH  | /v1/admin/users/:role/:userId/active      | JWT  | ADMIN | Activar o desactivar usuario                                 |

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
