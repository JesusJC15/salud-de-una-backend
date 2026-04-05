import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { CreateTriageSessionDto } from './dto/create-triage-session.dto';
import { SaveTriageAnswersDto } from './dto/save-triage-answers.dto';
import { TriageService } from './triage.service';

@Controller('triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('sessions')
  @Roles(UserRole.PATIENT)
  createSession(
    @Req() req: RequestContext,
    @Body() dto: CreateTriageSessionDto,
  ) {
    return this.triageService.createSession(req.user!, dto, req.correlationId);
  }

  @Post('sessions/:sessionId/answers')
  @HttpCode(200)
  @Roles(UserRole.PATIENT)
  saveAnswers(
    @Req() req: RequestContext,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveTriageAnswersDto,
  ) {
    return this.triageService.saveAnswers(
      sessionId,
      req.user!,
      dto,
      req.correlationId,
    );
  }

  @Post('sessions/:sessionId/analyze')
  @HttpCode(200)
  @Roles(UserRole.PATIENT)
  analyzeSession(
    @Req() req: RequestContext,
    @Param('sessionId') sessionId: string,
  ) {
    return this.triageService.analyzeSession(
      sessionId,
      req.user!,
      req.correlationId,
    );
  }
}
