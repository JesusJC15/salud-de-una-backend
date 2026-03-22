import { Controller, Post, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AiService } from './ai.service';

@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly aiService: AiService) {}

  @Post('health-check')
  @Roles(UserRole.ADMIN)
  healthCheck(@Req() req: RequestContext) {
    return this.aiService.healthCheck(req.user, req.correlationId);
  }
}
