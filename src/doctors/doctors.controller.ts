import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { RethusResubmitDto } from './dto/rethus-resubmit.dto';
import { DoctorsService } from './doctors.service';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get('me')
  @Roles(UserRole.DOCTOR)
  getMe(@Req() req: RequestContext) {
    return this.doctorsService.getMe(req.user!);
  }

  @Patch('me/availability')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  updateAvailability(
    @Body() dto: UpdateAvailabilityDto,
    @Req() req: RequestContext,
  ) {
    return this.doctorsService.updateAvailability(req.user!.userId, dto.status);
  }

  @Patch('me/push-token')
  @Roles(UserRole.DOCTOR)
  @HttpCode(204)
  async updatePushToken(
    @Body() dto: UpdatePushTokenDto,
    @Req() req: RequestContext,
  ) {
    await this.doctorsService.updatePushToken(req.user!.userId, dto.token);
  }

  @Post('me/rethus-resubmit')
  @Roles(UserRole.DOCTOR)
  rethusResubmit(@Body() dto: RethusResubmitDto, @Req() req: RequestContext) {
    return this.doctorsService.rethusResubmit(
      req.user!,
      dto,
      req.correlationId,
    );
  }
}
