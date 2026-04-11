import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
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
