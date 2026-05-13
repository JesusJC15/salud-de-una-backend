import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import {
  IngestDocumentDto,
  IngestDocumentUrlDto,
} from './dto/ingest-document.dto';
import { ListKnowledgeDocumentsDto } from './dto/list-knowledge-documents.dto';
import { ReviewKnowledgeDocumentDto } from './dto/review-knowledge-document.dto';
import { UpdateKnowledgeSourceDto } from './dto/update-knowledge-source.dto';
import { KnowledgeService } from './knowledge.service';

type UploadedKnowledgeFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('sources')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  listSources() {
    return this.knowledgeService.listSources();
  }

  @Post('sources')
  @Roles(UserRole.ADMIN)
  createSource(@Body() dto: CreateKnowledgeSourceDto) {
    return this.knowledgeService.createSource(dto);
  }

  @Patch('sources/:sourceId')
  @Roles(UserRole.ADMIN)
  updateSource(
    @Param('sourceId') sourceId: string,
    @Body() dto: UpdateKnowledgeSourceDto,
  ) {
    return this.knowledgeService.updateSource(sourceId, dto);
  }

  @Get('documents')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  listDocuments(@Query() query: ListKnowledgeDocumentsDto) {
    return this.knowledgeService.listDocuments(query);
  }

  @Post('documents/upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadDocument(
    @Body() dto: IngestDocumentDto,
    @Req() req: RequestContext,
    @UploadedFile() file?: UploadedKnowledgeFile,
  ) {
    return this.knowledgeService.ingestUploadedDocument(
      dto,
      req.user!,
      req.correlationId,
      file,
    );
  }

  @Post('documents/ingest-url')
  @Roles(UserRole.ADMIN)
  ingestUrl(@Body() dto: IngestDocumentUrlDto, @Req() req: RequestContext) {
    return this.knowledgeService.ingestDocumentFromUrl(
      dto,
      req.user!,
      req.correlationId,
    );
  }

  @Get('documents/:documentId')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  getDocument(@Param('documentId') documentId: string) {
    return this.knowledgeService.getDocument(documentId);
  }

  @Get('documents/:documentId/chunks')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  getDocumentChunks(@Param('documentId') documentId: string) {
    return this.knowledgeService.getDocumentChunks(documentId);
  }

  @Post('documents/:documentId/reprocess')
  @Roles(UserRole.ADMIN)
  reprocessDocument(
    @Param('documentId') documentId: string,
    @Req() req: RequestContext,
  ) {
    return this.knowledgeService.reprocessDocument(
      documentId,
      req.user!,
      req.correlationId,
    );
  }

  @Post('documents/:documentId/review')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  reviewDocument(
    @Param('documentId') documentId: string,
    @Body() dto: ReviewKnowledgeDocumentDto,
    @Req() req: RequestContext,
  ) {
    return this.knowledgeService.reviewDocument(documentId, dto, req.user!);
  }

  @Get('jobs')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  listJobs() {
    return this.knowledgeService.listJobs();
  }
}
