import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import { ConsultationsService } from './consultations.service';

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('queue')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  getQueue() {
    return this.consultationsService.getQueue();
  }
}
