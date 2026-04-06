# README - src/auth

## Objetivo

Registro, login, refresh, logout y sesion JWT.

## Archivos actuales

- auth.controller.ts
- auth.module.ts
- auth.service.spec.ts
- auth.service.ts

## Dependencias relacionadas

- auth/dto, auth/schemas, auth/strategies
- patients/doctors/admins
- common/interfaces y guards

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
| POST | /v1/auth/patient/register | Public | - | Registro paciente |
| POST | /v1/auth/doctor/register | Public | - | Registro doctor |
| POST | /v1/auth/patient/login | Public | - | Login paciente |
| POST | /v1/auth/staff/login | Public | - | Login doctor/admin |
| POST | /v1/auth/refresh | Public | - | Renovar token |
| POST | /v1/auth/logout | Public | - | Revocar sesion |
| GET | /v1/auth/me | JWT | ALL | Perfil autenticado |

## Ejemplos de codigo/payload

```json
{ "email": "user@demo.com", "password": "Secure123!" }
```

```json
{ "accessToken": "<jwt>", "refreshToken": "<jwt>" }
```

Notas de contrato relacionadas:

- `PUT /v1/patients/me` permite cambiar `email` y/o contrasena del paciente autenticado.
- Si el paciente cambia la contrasena, `auth` revoca todas sus refresh sessions activas con `revokedReason = password_changed`.
- Si solo cambia el correo, las refresh sessions existentes permanecen activas.

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
