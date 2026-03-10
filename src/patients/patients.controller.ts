import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@Roles(UserRole.PATIENT)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  getMe(@Req() req: RequestContext) {
    return this.patientsService.getMe(req.user!);
  }

  @Put('me')
  updateMe(@Req() req: RequestContext, @Body() dto: UpdatePatientProfileDto) {
    return this.patientsService.updateMe(req.user!, dto);
  }
}
