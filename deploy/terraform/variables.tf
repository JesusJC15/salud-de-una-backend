variable "aws_account_id" { type = string }
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "salud-de-una"
}
variable "env" {
  type    = string
  default = "dev"
}


variable "auth0_domain" { type = string }
variable "auth0_audience" { type = string }
variable "auth0_m2m_client_id" { type = string }
variable "auth0_role_id_patient" { type = string }
variable "auth0_role_id_doctor" { type = string }
variable "auth0_role_id_admin" { type = string }
variable "web_auth0_client_id" { type = string }

variable "ai_enabled" {
  type    = bool
  default = true
}
variable "gemini_model" {
  type    = string
  default = "gemini-2.5-flash"
}

# Tamaños de tasks — mínimos para cuenta estudiante con Fargate Spot
variable "backend_api_cpu" {
  type    = number
  default = 256
}
variable "backend_api_memory" {
  type    = number
  default = 512
}
variable "backend_worker_cpu" {
  type    = number
  default = 256
}
variable "backend_worker_memory" {
  type    = number
  default = 512
}
variable "web_cpu" {
  type    = number
  default = 256
}
variable "web_memory" {
  type    = number
  default = 512
}
