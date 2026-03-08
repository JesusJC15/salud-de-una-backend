import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AdminService } from './admin.service';
import { RethusVerifyDto } from './dto/rethus-verify.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
