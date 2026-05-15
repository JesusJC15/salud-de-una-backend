# ─── CloudWatch Log Groups ────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend_api" {
  name              = "/ecs/${var.project}/dev/backend-api"
  retention_in_days = 7
}
resource "aws_cloudwatch_log_group" "backend_worker" {
  name              = "/ecs/${var.project}/dev/backend-worker"
  retention_in_days = 7
}
resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project}/dev/web"
  retention_in_days = 7
}

# ─── ECS Cluster ─────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = local.prefix
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
    base              = 0
  }
}

# ─── Locals: variables de entorno comunes del backend ─────────────────────────
locals {
  backend_env_vars = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
    { name = "AUTH0_DOMAIN", value = var.auth0_domain },
    { name = "AUTH0_AUDIENCE", value = var.auth0_audience },
    { name = "AUTH0_ISSUER", value = "https://${var.auth0_domain}/" },
    { name = "AUTH0_M2M_CLIENT_ID", value = var.auth0_m2m_client_id },
    { name = "AUTH0_ROLE_ID_PATIENT", value = var.auth0_role_id_patient },
    { name = "AUTH0_ROLE_ID_DOCTOR", value = var.auth0_role_id_doctor },
    { name = "AUTH0_ROLE_ID_ADMIN", value = var.auth0_role_id_admin },
    { name = "CORS_ORIGINS_PATIENT", value = "http://${aws_lb.main.dns_name}" },
    { name = "CORS_ORIGINS_STAFF", value = "http://${aws_lb.main.dns_name}" },
    { name = "AI_ENABLED", value = tostring(var.ai_enabled) },
    { name = "GEMINI_MODEL", value = var.gemini_model },
    { name = "OTEL_ENABLED", value = "false" },
    { name = "OTEL_SERVICE_NAME", value = "salud-de-una-backend" },
  ]

  backend_secrets = [
    { name = "MONGODB_URI", valueFrom = aws_ssm_parameter.secrets["MONGODB_URI"].arn },
    { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.secrets["JWT_SECRET"].arn },
    { name = "JWT_REFRESH_SECRET", valueFrom = aws_ssm_parameter.secrets["JWT_REFRESH_SECRET"].arn },
    { name = "REDIS_URL", valueFrom = aws_ssm_parameter.secrets["REDIS_URL"].arn },
    { name = "GEMINI_API_KEY", valueFrom = aws_ssm_parameter.secrets["GEMINI_API_KEY"].arn },
    { name = "AUTH0_M2M_CLIENT_SECRET", valueFrom = aws_ssm_parameter.secrets["AUTH0_M2M_CLIENT_SECRET"].arn },
  ]
}

# ─── Task Definition: Backend API ─────────────────────────────────────────────
resource "aws_ecs_task_definition" "backend_api" {
  family                   = "${local.prefix}-backend-api"
  cpu                      = var.backend_api_cpu
  memory                   = var.backend_api_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = data.aws_iam_role.lab_role.arn
  task_role_arn            = data.aws_iam_role.lab_role.arn

  container_definitions = jsonencode([{
    name      = "backend-api"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = concat(local.backend_env_vars, [
      { name = "APP_RUNTIME_ROLE", value = "api" }
    ])
    secrets = local.backend_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend_api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "node docker/healthcheck.js || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# ─── Task Definition: Backend Worker ──────────────────────────────────────────
resource "aws_ecs_task_definition" "backend_worker" {
  family                   = "${local.prefix}-backend-worker"
  cpu                      = var.backend_worker_cpu
  memory                   = var.backend_worker_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = data.aws_iam_role.lab_role.arn
  task_role_arn            = data.aws_iam_role.lab_role.arn

  container_definitions = jsonencode([{
    name      = "backend-worker"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true

    environment = concat(local.backend_env_vars, [
      { name = "APP_RUNTIME_ROLE", value = "worker" }
    ])
    secrets = local.backend_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend_worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# ─── Task Definition: Web ─────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "web" {
  family                   = "${local.prefix}-web"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = data.aws_iam_role.lab_role.arn
  task_role_arn            = data.aws_iam_role.lab_role.arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${aws_ecr_repository.web.repository_url}:latest"
    essential = true

    portMappings = [{ containerPort = 3001, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3001" },
      # NOTA: NEXT_PUBLIC_* no pueden inyectarse en runtime.
      # Son bakeadas en la imagen durante el build de CodeBuild (script 04-build.sh).
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.web.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO /dev/null http://localhost:3001/api/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

# ─── ECS Services ─────────────────────────────────────────────────────────────

resource "aws_ecs_service" "backend_api" {
  name            = "${local.prefix}-backend-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend_api.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend-api"
    container_port   = 3000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # CI/CD actualiza la task_definition directamente vía AWS CLI
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_ecs_service" "backend_worker" {
  name            = "${local.prefix}-backend-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend_worker.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_ecs_service" "web" {
  name            = "${local.prefix}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http]
}
