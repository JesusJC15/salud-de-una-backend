import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { SubmitFollowupDto } from './dto/submit-followup.dto';
import { FollowupStatus } from './schemas/followup.schema';
import { FollowupsService } from './followups.service';

@Controller('followups')
export class FollowupsController {
  constructor(private readonly followupsService: FollowupsService) {}

  @Get('mine')
  @Roles(UserRole.PATIENT)
  getMine(@Req() req: RequestContext, @Query('status') status?: string) {
    return this.followupsService.getMine(
      req.user!,
      // Query params are strings; cast to FollowupStatus for the service
      status as unknown as FollowupStatus,
    );
  }

  @Get(':followupId')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  getById(@Req() req: RequestContext, @Param('followupId') followupId: string) {
    return this.followupsService.getById(followupId, req.user!);
  }

  @Post()
  @Roles(UserRole.PATIENT)
  submit(@Req() req: RequestContext, @Body() dto: SubmitFollowupDto) {
    return this.followupsService.submit(req.user!, dto);
  }
}
