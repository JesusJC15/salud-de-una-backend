import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';

@Controller('consultations')
export class ConsultationsController {
  @Get('queue')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  getQueue() {
    return { items: [] };
  }
}
