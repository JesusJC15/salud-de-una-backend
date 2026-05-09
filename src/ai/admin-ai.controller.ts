import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AiService } from './ai.service';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';

@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly aiService: AiService) {}

  @Post('health-check')
  @Roles(UserRole.ADMIN)
  healthCheck(@Req() req: RequestContext) {
    return this.aiService.healthCheck(req.user, req.correlationId);
  }

  @Get('prompts')
  @Roles(UserRole.ADMIN)
  listPrompts(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.aiService.listPrompts(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get('prompts/:key')
  @Roles(UserRole.ADMIN)
  getPromptVersions(@Param('key') key: string) {
    return this.aiService.getPromptVersions(key);
  }

  @Post('prompts')
  @Roles(UserRole.ADMIN)
  createPromptVersion(@Body() dto: CreatePromptVersionDto) {
    return this.aiService.createPromptVersion(dto);
  }

  @Patch('prompts/:id/toggle')
  @Roles(UserRole.ADMIN)
  togglePromptActive(
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.aiService.togglePromptActive(id, body.active);
  }
}
