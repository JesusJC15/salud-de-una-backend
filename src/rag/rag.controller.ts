import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AnswerDto } from './dto/answer.dto';
import { CreateRagFeedbackDto } from './dto/create-rag-feedback.dto';
import { RetrieveDto } from './dto/retrieve.dto';
import { RagService } from './rag.service';

@ApiTags('rag')
@ApiBearerAuth()
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('retrieve')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Retrieve approved grounded knowledge chunks' })
  @ApiOkResponse({ description: 'Ranked retrieval results with trace id' })
  retrieve(@Body() dto: RetrieveDto, @Req() req: RequestContext) {
    return this.ragService.retrieve(dto, req.user, req.correlationId);
  }

  @Post('answer')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Generate an assisted RAG answer with citations and disclaimer',
  })
  @ApiOkResponse({
    description: 'Grounded answer, fallback answer, citations and disclaimer',
  })
  answer(@Body() dto: AnswerDto, @Req() req: RequestContext) {
    return this.ragService.answer(dto, req.user, req.correlationId);
  }

  @Post('feedback')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  feedback(@Body() dto: CreateRagFeedbackDto, @Req() req: RequestContext) {
    return this.ragService.captureFeedback(dto, req.user);
  }
}
