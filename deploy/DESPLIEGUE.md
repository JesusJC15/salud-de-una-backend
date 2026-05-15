# Despliegue de SaludDeUna en AWS

## Requisitos previos (antes de abrir CloudShell)

Antes de empezar, ten a mano estos valores:

| Dato | Dónde encontrarlo |
|---|---|
| URL de tu repo GitHub | ej: `https://github.com/tu-usuario/SaludDeUna` |
| GitHub Personal Access Token | GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → marcar `repo` |
| MongoDB Atlas URI | Atlas → tu cluster → Connect → Drivers → Node.js → copia la URI y reemplaza `<password>` |
| Redis Cloud URL | Redis Cloud → tu database → Connect → copia `rediss://...` |
| Gemini API Key | aistudio.google.com/apikey |
| Auth0 M2M Client Secret | Auth0 Dashboard → Applications → [tu M2M app] → Settings → Client Secret |
| Auth0 Role IDs | Auth0 Dashboard → User Management → Roles → clic en cada rol → copia el ID de la URL |

---

## Paso a paso — Todo desde AWS CloudShell

### Abrir CloudShell

1. Entra a AWS Console (console.aws.amazon.com)
2. Inicia sesión con tu cuenta de estudiante
3. Haz clic en el ícono de terminal `>_` en la barra superior → **CloudShell**
4. Espera que cargue (30-60 segundos la primera vez)

---

### Paso 1 — Clonar el repositorio

```bash
# Si es la primera vez:
git clone https://github.com/TU-USUARIO/SaludDeUna.git
cd SaludDeUna

# Si ya lo tienes clonado:
cd SaludDeUna
git pull origin main
```

---

### Paso 2 — Dar permisos de ejecución a los scripts

```bash
chmod +x deploy/scripts/*.sh
```

---

### Paso 3 — Instalar Terraform (solo necesario 1 vez por sesión)

```bash
bash deploy/scripts/00-setup.sh
```

Esto instala Terraform en tu home de CloudShell y verifica tus credenciales AWS.
**Si la sesión de CloudShell expiró y volviste, ejecuta este script de nuevo.**

---

### Paso 4 — Configurar variables del proyecto

```bash
bash deploy/scripts/01-configure.sh
```

El script te pregunta interactivamente por:

- URL de tu repo GitHub
- Token de GitHub
- IDs y dominios de Auth0

Al final genera `deploy/terraform/terraform.tfvars` con tus valores.

---

### Paso 5 — Crear la infraestructura en AWS

```bash
bash deploy/scripts/02-infra.sh
```

Esto ejecuta `terraform init` y `terraform apply`.  
Te muestra el plan y pide confirmación antes de crear recursos.

**Lo que crea (~5-8 minutos):**

- VPC con 2 subnets públicas
- Application Load Balancer
- ECR (repositorios de imágenes Docker)
- ECS Cluster + 3 services (backend-api, backend-worker, web)
- IAM roles (mínimos)
- SSM Parameter Store (para secrets)
- CodeBuild projects (para construir las imágenes)

Al terminar te muestra el **DNS del ALB** — guárdalo.

---

### Paso 6 — Configurar los secrets

```bash
bash deploy/scripts/03-secrets.sh
```

Te pide cada secret en modo silencioso (no se muestra lo que escribes).  
Los guarda cifrados en AWS SSM Parameter Store.

**Secrets que necesitas:**

- `MONGODB_URI` — tu Atlas connection string con contraseña real
- `JWT_SECRET` — genera uno con `openssl rand -hex 32` en otra terminal
- `JWT_REFRESH_SECRET` — otro con `openssl rand -hex 32`
- `REDIS_URL` — tu Redis Cloud URL (formato `rediss://user:pass@host:port`)
- `GEMINI_API_KEY` — tu clave de Google AI Studio
- `AUTH0_M2M_CLIENT_SECRET` — el client secret de Auth0
- `GITHUB_TOKEN` — el token que creaste antes (para que CodeBuild clone el repo)

---

### Paso 7 — Construir las imágenes Docker

```bash
bash deploy/scripts/04-build.sh
```

Como CloudShell no tiene Docker, este script usa **AWS CodeBuild** para construir las imágenes y subirlas a ECR automáticamente.

**Espera ~10-15 minutos** (el script muestra el progreso cada 30 segundos).  
El build de Next.js tarda más que el backend.

Si algún build falla, ejecuta `bash deploy/scripts/fix-common-errors.sh` y elige opción 2.

---

### Paso 8 — Desplegar en ECS

```bash
bash deploy/scripts/05-deploy.sh
```

Fuerza un nuevo deploy en los 3 ECS services con las imágenes recién construidas.  
Espera que todos queden en estado `ACTIVE` (~3-5 minutos).

---

### Paso 9 — Verificar que todo funciona

```bash
bash deploy/scripts/06-verify.sh
```

Hace health checks a todos los endpoints y muestra el estado de los services.

---

### Paso 10 — Actualizar Auth0

Con el DNS del ALB que obtuviste en el Paso 5:

1. Ve a Auth0 Dashboard → Applications → **[tu SPA web]** → Settings
2. En **Allowed Callback URLs**: agrega `http://TU_ALB_DNS/callback`
3. En **Allowed Logout URLs**: agrega `http://TU_ALB_DNS`
4. En **Allowed Web Origins**: agrega `http://TU_ALB_DNS`
5. Guarda cambios

---

## URLs de acceso (después del despliegue)

```
App Web:   http://TU_ALB_DNS/
API:       http://TU_ALB_DNS/v1/
Swagger:   http://TU_ALB_DNS/v1/docs
```

---

## Para re-desplegar después de cambios en el código

Cada vez que hagas cambios y quieras actualizar la app:

```bash
# En CloudShell, desde la carpeta SaludDeUna/:
git pull origin main                        # traer cambios
bash deploy/scripts/00-setup.sh             # reinstalar terraform si la sesión expiró
bash deploy/scripts/04-build.sh             # rebuild imágenes
bash deploy/scripts/05-deploy.sh            # re-deploy en ECS
bash deploy/scripts/06-verify.sh            # verificar
```

---

## Ver logs en tiempo real

```bash
# Backend API:
aws logs tail /ecs/salud-de-una/dev/backend-api --follow --region us-east-1

# Worker (BullMQ):
aws logs tail /ecs/salud-de-una/dev/backend-worker --follow --region us-east-1

# Web Next.js:
aws logs tail /ecs/salud-de-una/dev/web --follow --region us-east-1
```

---

## Algo falla — diagnóstico rápido

```bash
bash deploy/scripts/fix-common-errors.sh
```

Menú interactivo con diagnóstico de los errores más frecuentes.

---

## Destruir toda la infraestructura (al finalizar el semestre)

```bash
cd deploy/terraform
terraform destroy
```

Confirma con `yes`. Elimina todos los recursos de AWS para no gastar más créditos.
**Los datos en MongoDB Atlas y Redis Cloud NO se borran** (son externos).

---

## Costos estimados

| Recurso | Costo/mes |
|---|---|
| ECS Fargate SPOT (3 tasks × 0.25vCPU) | ~$6-9 |
| ALB | ~$18 |
| ECR (almacenamiento) | ~$0.10 |
| CloudWatch Logs (7 días) | ~$1-3 |
| CodeBuild (solo al hacer build) | ~$0.50/build |
| SSM Parameter Store | $0 |
| **Total estimado** | **~$26-31/mes** |

Con $100 de crédito de estudiante → **3-4 meses de operación**.

El mayor costo es el ALB ($18/mes fijo). Si necesitas ahorrar más, puedes eliminar el despliegue cuando no lo uses con `terraform destroy` y recrearlo cuando lo necesites.
