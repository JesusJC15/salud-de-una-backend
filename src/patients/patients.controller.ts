import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
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

  @Patch('me/push-token')
  @HttpCode(204)
  async updatePushToken(
    @Req() req: RequestContext,
    @Body() dto: UpdatePushTokenDto,
  ) {
    await this.patientsService.updatePushToken(req.user!.userId, dto.token);
  }
}
