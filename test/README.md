# README - test

## Objetivo

Arquitectura E2E modular para validar contratos HTTP y flujos cross-module sin mezclar dominios en specs monoliticos.

## Estructura

```text
test/
├── e2e/
│   ├── admin/
│   ├── auth/
│   ├── clinical-ai/
│   ├── consultations/
│   ├── dashboard/
│   ├── doctors/
│   ├── notifications/
│   ├── patients/
│   ├── system/
│   ├── triage/
│   └── support/
├── jest-e2e.json
├── jest.setup.ts
└── README.md
```

## Principios de organizacion

- Un archivo E2E debe pertenecer a un solo bounded context o flujo transversal claramente delimitado.
- `test/e2e/support/` concentra bootstrap, limpieza de base, builders, contratos y flows reutilizables.
- Los datos de prueba deben construirse con builders o helpers; no repetir payloads grandes en cada suite.
- Cada suite debe poder ejecutarse de forma aislada sin depender del orden de otros archivos.
- La limpieza de estado debe ocurrir en `beforeEach`; el bootstrap de Nest y Mongo solo en `beforeAll`.

## Dominios cubiertos hoy

- `auth/`: registro, login, refresh, logout y `auth/me`.
- `admin/`: usuarios y controles administrativos.
- `doctors/`: onboarding, verificacion y reenvio de REThUS.
- `patients/`: perfil y cambios sensibles de credenciales.
- `triage/`: sesiones, reanudacion, cancelacion, analisis y fallback IA/rules.
- `consultations/`: acceso a cola por estado del medico.
- `notifications/`: inbox y marcacion de lectura.
- `dashboard/`: metricas de negocio y tecnicas.
- `clinical-ai/`: health-check administrativo de IA.
- `system/`: readiness del servicio.

## Dominios pendientes

- `chat/`
- `followups/`
- cualquier modulo nuevo debe crear su carpeta dedicada dentro de `test/e2e/`

## Naming conventions

- Carpeta: nombre del dominio o subdominio, en kebab-case.
- Archivo: `<bounded-context>-<flow>.e2e-spec.ts`.
- `describe`: `E2E <Domain> / <Capability>`.
- `it`: comportamiento observable y resultado esperado, sin prefijos redundantes de endpoint cuando no aportan contexto.

## Setup y aislamiento

- `E2eTestContext` encapsula:
  - `mongodb-memory-server`
  - bootstrap de Nest
  - override del `ThrottlerGuard`
  - restauracion de variables de entorno
  - limpieza de colecciones
- `resetState({ seedDefaultAdmin: true })` permite seeds pequeños, deterministas y por necesidad.
- Evitar fixtures globales gigantes. Sembrar solo los actores requeridos para cada caso.

## Ejecucion parcial

- Suite completa: `npm run test:e2e -- --runInBand`
- Por dominio:
  - `npm run test:e2e:auth`
  - `npm run test:e2e:triage`
  - `npm run test:e2e:doctors`
- Ad hoc por carpeta o archivo:
  - `npm run test:e2e -- test/e2e/triage`
  - `npm run test:e2e -- test/e2e/patients/patient-profile.e2e-spec.ts`

## Buenas practicas

- Mantener `response.body` tipado en helpers compartidos para evitar `any`.
- Esperar side effects asincronos con helpers de polling acotados, no con `setTimeout` suelto.
- No validar detalles internos del framework si el contrato HTTP ya cubre el comportamiento observable.
- Cuando un flujo depende de IA, usar override del provider a nivel de suite para evitar flakiness.
- Reservar una suite separada para fallback, otra para IA asistida y otra para lifecycle del dominio.

## CI/CD

- Ejecutar `npx eslint "test/e2e/**/*.ts"` como gate rapido del refactor E2E.
- Ejecutar `npm run test:e2e -- --runInBand` en entornos con recursos limitados o Windows runners inestables.
- Para runners mas grandes, paralelizar por dominio con jobs separados (`auth`, `triage`, `patients`, etc.) en lugar de un solo proceso gigantesco.
- Publicar reportes por carpeta para identificar facilmente el bounded context que falla.
- Si una suite usa `mongodb-memory-server`, cachear binarios del motor o preparar la descarga en la imagen base del runner para reducir tiempos de cold start.

## Errores comunes y mitigacion

- Mezclar multiples dominios en un solo spec: mover el caso al bounded context correcto.
- Repetir bootstrap o seeds manuales: extraer a `support/`.
- Usar datos estaticos compartidos entre tests: reemplazar con builders `uniqueValue(...)`.
- Introducir waits arbitrarios: usar polling controlado y con timeout explicito.

## Checklist de PR

- [ ] La suite nueva vive en la carpeta de dominio correcta.
- [ ] Se reutilizaron builders/helpers existentes antes de crear otros nuevos.
- [ ] El caso limpia su estado via `resetState`.
- [ ] Se documento el dominio si cambia el alcance de cobertura E2E.
- [ ] Se ejecutaron los comandos de validacion relevantes o se dejo constancia de bloqueo.
