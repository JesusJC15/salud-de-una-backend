import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AdminService } from './admin.service';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { RethusDecisionDto } from './dto/rethus-decision.dto';
import { RethusVerifyDto } from './dto/rethus-verify.dto';
import { UpdateUserActiveDto } from './dto/update-user-active.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('doctors')
  @Roles(UserRole.ADMIN)
  listDoctors(@Query() query: ListDoctorsForReviewDto) {
    return this.adminService.listDoctorsForReview(query);
  }

  @Get('doctors/review')
  @Roles(UserRole.ADMIN)
  listDoctorsReviewAlias(@Query() query: ListDoctorsForReviewDto) {
    return this.adminService.listDoctorsForReview(query);
  }

  @Post('doctors/:doctorId/doctor-verify')
  @Roles(UserRole.ADMIN)
  verifyDoctorLegacy(
    @Param('doctorId') doctorId: string,
    @Body() dto: RethusVerifyDto | RethusDecisionDto,
    @Req() req: RequestContext,
  ) {
    return this.adminService.verifyDoctor(
      doctorId,
      dto,
      req.user!,
      req.correlationId,
    );
  }

  @Post('doctors/:doctorId/rethus-verify')
  @Roles(UserRole.ADMIN)
  verifyDoctor(
    @Param('doctorId') doctorId: string,
    @Body() dto: RethusVerifyDto | RethusDecisionDto,
    @Req() req: RequestContext,
  ) {
    return this.adminService.verifyDoctor(
      doctorId,
      dto,
      req.user!,
      req.correlationId,
    );
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  listUsers(@Query() query: ListUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:role')
  @Roles(UserRole.ADMIN)
  listUsersByRole(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Query() query: ListUsersDto,
  ) {
    return this.adminService.listUsers({
      ...query,
      role,
    });
  }

  @Get('users/:role/:userId')
  @Roles(UserRole.ADMIN)
  getUserByRole(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Param('userId') userId: string,
  ) {
    return this.adminService.getUserByRole(role, userId);
  }

  @Patch('users/:role/:userId/active')
  @Roles(UserRole.ADMIN)
  updateUserActive(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserActiveDto,
  ) {
    return this.adminService.updateUserActive(role, userId, dto);
  }
}
