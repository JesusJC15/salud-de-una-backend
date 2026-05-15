# ─── SSM Parameter Store — Secrets del Backend ───────────────────────────────
# Los parámetros se crean con valor "placeholder".
# El script 03-secrets.sh los llena con los valores reales.
# lifecycle ignore_changes = [value] → Terraform no sobreescribe lo que llenaste.

locals {
  secret_params = {
    "MONGODB_URI"             = "MongoDB Atlas connection string"
    "JWT_SECRET"              = "JWT signing secret (min 32 chars)"
    "JWT_REFRESH_SECRET"      = "JWT refresh secret (min 32 chars)"
    "REDIS_URL"               = "Redis Cloud connection URL"
    "GEMINI_API_KEY"          = "Google Gemini API key"
    "AUTH0_M2M_CLIENT_SECRET" = "Auth0 M2M application client secret"
    # GITHUB_TOKEN eliminado: Academy no permite ImportSourceCredentials.
    # Los repos deben ser públicos para que CodeBuild los clone sin auth.
  }
}

resource "aws_ssm_parameter" "secrets" {
  for_each    = local.secret_params
  name        = "/${var.project}/${each.key}"
  type        = "SecureString"
  value       = "placeholder"
  description = each.value

  lifecycle {
    # Nunca sobreescribir el valor real que se puso con el script 03-secrets.sh
    ignore_changes = [value]
  }
}
