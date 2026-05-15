# ─── CodeBuild: Build de imágenes Docker ─────────────────────────────────────
# CloudShell no tiene Docker → CodeBuild construye y sube las imágenes a ECR.
# Cada proyecto apunta a un repo de GitHub DISTINTO (no es monorepo).
# El Dockerfile está en la RAÍZ de cada repo.

locals {
  buildspec_backend = yamlencode({
    version = "0.2"
    phases = {
      pre_build = {
        commands = [
          "echo Logging in to ECR...",
          "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
          "COMMIT_SHA=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-7)",
          "IMAGE_TAG=$${COMMIT_SHA:-latest}",
          "echo Commit SHA: $IMAGE_TAG"
        ]
      }
      build = {
        commands = [
          # El repo se clonó en la raíz — Dockerfile está aquí directamente
          "echo Building backend image...",
          "docker build --target runner -t $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG -t $ECR_REGISTRY/$BACKEND_REPO:latest ."
        ]
      }
      post_build = {
        commands = [
          "docker push $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG",
          "docker push $ECR_REGISTRY/$BACKEND_REPO:latest",
          "echo Imagen subida: $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG"
        ]
      }
    }
  })

  buildspec_web = yamlencode({
    version = "0.2"
    phases = {
      pre_build = {
        commands = [
          "echo Logging in to ECR...",
          "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
          "COMMIT_SHA=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-7)",
          "IMAGE_TAG=$${COMMIT_SHA:-latest}",
          "echo Commit SHA: $IMAGE_TAG"
        ]
      }
      build = {
        commands = [
          # El repo se clonó en la raíz — Dockerfile está aquí directamente
          "echo Building web image...",
          "docker build --target runner --build-arg NEXT_OUTPUT=standalone --build-arg NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL --build-arg NEXT_PUBLIC_AUTH0_DOMAIN=$NEXT_PUBLIC_AUTH0_DOMAIN --build-arg NEXT_PUBLIC_AUTH0_CLIENT_ID=$NEXT_PUBLIC_AUTH0_CLIENT_ID --build-arg NEXT_PUBLIC_AUTH0_AUDIENCE=$NEXT_PUBLIC_AUTH0_AUDIENCE --build-arg NEXT_PUBLIC_AUTH0_REDIRECT_URI=$NEXT_PUBLIC_AUTH0_REDIRECT_URI -t $ECR_REGISTRY/$WEB_REPO:$IMAGE_TAG -t $ECR_REGISTRY/$WEB_REPO:latest ."
        ]
      }
      post_build = {
        commands = [
          "docker push $ECR_REGISTRY/$WEB_REPO:$IMAGE_TAG",
          "docker push $ECR_REGISTRY/$WEB_REPO:latest",
          "echo Imagen subida: $ECR_REGISTRY/$WEB_REPO:$IMAGE_TAG"
        ]
      }
    }
  })
}

# ── CodeBuild Project: Backend ────────────────────────────────────────────────
resource "aws_codebuild_project" "backend" {
  name          = "${local.prefix}-build-backend"
  description   = "Build imagen Docker del backend NestJS → ECR"
  build_timeout = 20
  service_role  = data.aws_iam_role.lab_role.arn

  source {
    type            = "GITHUB"
    location        = var.github_repo_backend
    # Repo debe ser PÚBLICO — Academy no permite registrar credenciales GitHub via API
    git_clone_depth = 1
    buildspec       = local.buildspec_backend
  }

  source_version = var.github_branch

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true

    environment_variable {
      name  = "AWS_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "ECR_REGISTRY"
      value = local.ecr_base
    }
    environment_variable {
      name  = "BACKEND_REPO"
      value = aws_ecr_repository.backend.name
    }
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/codebuild/${local.prefix}/backend"
      stream_name = "build"
    }
  }
}

# ── CodeBuild Project: Web ────────────────────────────────────────────────────
resource "aws_codebuild_project" "web" {
  name          = "${local.prefix}-build-web"
  description   = "Build imagen Docker del web Next.js → ECR"
  build_timeout = 25
  service_role  = data.aws_iam_role.lab_role.arn

  source {
    type            = "GITHUB"
    location        = var.github_repo_web
    # Repo debe ser PÚBLICO — Academy no permite registrar credenciales GitHub via API
    git_clone_depth = 1
    buildspec       = local.buildspec_web
  }

  source_version = var.github_branch

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true

    environment_variable {
      name  = "AWS_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "ECR_REGISTRY"
      value = local.ecr_base
    }
    environment_variable {
      name  = "WEB_REPO"
      value = aws_ecr_repository.web.name
    }
    environment_variable {
      name  = "NEXT_PUBLIC_AUTH0_DOMAIN"
      value = var.auth0_domain
    }
    environment_variable {
      name  = "NEXT_PUBLIC_AUTH0_CLIENT_ID"
      value = var.web_auth0_client_id
    }
    environment_variable {
      name  = "NEXT_PUBLIC_AUTH0_AUDIENCE"
      value = var.auth0_audience
    }
    # Estas dos las sobreescribe 04-build.sh con el DNS real del ALB
    environment_variable {
      name  = "NEXT_PUBLIC_API_BASE_URL"
      value = "http://${aws_lb.main.dns_name}/v1"
    }
    environment_variable {
      name  = "NEXT_PUBLIC_AUTH0_REDIRECT_URI"
      value = "http://${aws_lb.main.dns_name}/callback"
    }
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/codebuild/${local.prefix}/web"
      stream_name = "build"
    }
  }
}

# aws_codebuild_source_credential eliminado:
# Academy no permite codebuild:ImportSourceCredentials.
# Solución: ambos repos deben ser PÚBLICOS en GitHub.
# CodeBuild puede clonar repos públicos sin credenciales.
