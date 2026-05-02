import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import type { RequestContext } from '../common/interfaces/request-context.interface';
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

  @Get(':id')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  getById(@Param('id') id: string, @Req() req: RequestContext) {
    return this.consultationsService.getById(id, req.user!.userId);
  }

  @Patch(':id/assign')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  assign(@Param('id') id: string, @Req() req: RequestContext) {
    return this.consultationsService.assign(id, req.user!.userId);
  }

  @Post(':id/summary/generate')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  generateSummary(@Param('id') id: string, @Req() req: RequestContext) {
    return this.consultationsService.generateSummary(id, req.user!.userId);
  }

  @Patch(':id/close')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  close(@Param('id') id: string, @Req() req: RequestContext) {
    return this.consultationsService.close(id, req.user!.userId);
  }

  @Get(':id/messages')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Req() req: RequestContext,
  ) {
    return this.consultationsService.getMessages(
      id,
      req.user!.userId,
      limit ? Math.min(parseInt(limit, 10) || 50, 100) : 50,
    );
  }
}
