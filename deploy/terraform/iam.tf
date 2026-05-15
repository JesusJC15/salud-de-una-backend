# ─── IAM — AWS Academy Learner Lab ───────────────────────────────────────────
#
# El rol de laboratorio (voclabs) NO tiene permiso para iam:CreateRole.
# AWS Academy pre-crea el rol "LabRole" en cada cuenta con los permisos
# necesarios para ECS, ECR, SSM, CloudWatch y CodeBuild.
# Lo referenciamos con un data source en lugar de crearlo.

data "aws_iam_role" "lab_role" {
  name = "LabRole"
}
