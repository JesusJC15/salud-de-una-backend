import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  @Roles(UserRole.PATIENT)
  getMe(@Req() req: RequestContext) {
    return this.patientsService.getMe(req.user!);
  }

  @Put('me')
  @Roles(UserRole.PATIENT)
  updateMe(@Req() req: RequestContext, @Body() dto: UpdatePatientProfileDto) {
    return this.patientsService.updateMe(req.user!, dto);
  }

  @Patch('me/push-token')
  @Roles(UserRole.PATIENT)
  updatePushToken(@Req() req: RequestContext, @Body() dto: UpdatePushTokenDto) {
    return this.patientsService.updatePushToken(req.user!, dto);
  }

  @Get(':patientId/timeline')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  getTimeline(
    @Req() req: RequestContext,
    @Param('patientId') patientId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.patientsService.getTimeline(req.user!, patientId, query);
  }
}
