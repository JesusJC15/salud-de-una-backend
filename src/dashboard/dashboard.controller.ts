import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
}
