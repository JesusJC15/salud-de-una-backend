output "alb_dns_name" {
  description = "DNS del Application Load Balancer — usa esta URL para acceder a la app"
  value       = aws_lb.main.dns_name
}

output "vpc_id" {
  description = "ID de la VPC"
  value       = aws_vpc.main.id
}

output "subnet_public_a_id" {
  description = "ID de la subnet pública A"
  value       = aws_subnet.public_a.id
}

output "backend_ecr_url" {
  description = "URL del repositorio ECR del backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "web_ecr_url" {
  description = "URL del repositorio ECR del web"
  value       = aws_ecr_repository.web.repository_url
}

output "ecs_cluster_name" {
  description = "Nombre del cluster ECS"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "Nombres de los ECS services"
  value = [
    aws_ecs_service.backend_api.name,
    aws_ecs_service.backend_worker.name,
    aws_ecs_service.web.name,
  ]
}

output "app_url" {
  description = "URL de acceso a la aplicación web"
  value       = "http://${aws_lb.main.dns_name}"
}

output "api_url" {
  description = "URL de acceso a la API"
  value       = "http://${aws_lb.main.dns_name}/v1"
}

output "swagger_url" {
  description = "URL de Swagger docs"
  value       = "http://${aws_lb.main.dns_name}/v1/docs"
}

output "cloudwatch_log_groups" {
  description = "Log groups en CloudWatch"
  value = {
    backend_api    = aws_cloudwatch_log_group.backend_api.name
    backend_worker = aws_cloudwatch_log_group.backend_worker.name
    web            = aws_cloudwatch_log_group.web.name
  }
}
