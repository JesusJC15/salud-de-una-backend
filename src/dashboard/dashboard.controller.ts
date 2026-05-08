import { Controller, Get, Query } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DashboardService } from './dashboard.service';
import { ErrorLogsService } from './error-logs.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly errorLogsService: ErrorLogsService,
    private readonly aiService: AiService,
  ) {}

  @Get('technical')
  @Roles(UserRole.ADMIN)
  getTechnical() {
    return this.dashboardService.getTechnicalMetrics();
  }

  @Get('business')
  @Roles(UserRole.ADMIN)
  getBusiness() {
    return this.dashboardService.getBusinessMetrics();
  }

  @Get('consultations')
  @Roles(UserRole.ADMIN)
  getConsultations() {
    return this.dashboardService.getConsultationMetrics();
  }

  @Get('alerts')
  @Roles(UserRole.ADMIN)
  getAlerts() {
    return this.dashboardService.getAlerts();
  }

  @Get('errors')
  @Roles(UserRole.ADMIN)
  getRecentErrors(@Query('limit') limit?: string) {
    return this.errorLogsService.getRecent(limit ? Number(limit) : 20);
  }

  @Get('ai-metrics')
  @Roles(UserRole.ADMIN)
  getAiMetrics() {
    return this.aiService.getUsageMetrics();
  }
}
