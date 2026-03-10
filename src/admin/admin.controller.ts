import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AdminService } from './admin.service';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
import { RethusVerifyDto } from './dto/rethus-verify.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('doctors')
  @Roles(UserRole.ADMIN)
  listDoctors(@Query() query: ListDoctorsForReviewDto) {
    return this.adminService.listDoctorsForReview(query);
  }

  @Post('doctors/:doctorId/doctor-verify')
  @Roles(UserRole.ADMIN)
  verifyDoctor(
    @Param('doctorId') doctorId: string,
    @Body() dto: RethusVerifyDto,
    @Req() req: RequestContext,
  ) {
    return this.adminService.verifyDoctor(doctorId, dto, req.user!);
  }
}
