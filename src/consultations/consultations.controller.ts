import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { CloseConsultationDto } from './dto/close-consultation.dto';
import { ListConsultationsHistoryDto } from './dto/list-consultations-history.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { SummaryFeedbackDto } from './dto/summary-feedback.dto';
import { ConsultationsService } from './consultations.service';

@ApiTags('consultations')
@ApiBearerAuth()
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('queue')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  getQueue(@Req() req: RequestContext) {
    return this.consultationsService.getQueue(req.user!);
  }

  @Get('doctor/my-history')
  @Roles(UserRole.DOCTOR)
  getDoctorHistory(
    @Req() req: RequestContext,
    @Query() query: ListConsultationsHistoryDto,
  ) {
    return this.consultationsService.getDoctorHistory(req.user!, query);
  }

  @Get('my-history')
  @Roles(UserRole.PATIENT)
  getPatientHistory(
    @Req() req: RequestContext,
    @Query() query: ListConsultationsHistoryDto,
  ) {
    return this.consultationsService.getPatientHistory(req.user!, query);
  }

  @Get(':consultationId')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT, UserRole.ADMIN)
  getById(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
  ) {
    return this.consultationsService.getById(consultationId, req.user!);
  }

  @Patch(':consultationId/assign')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  @ApiOperation({
    summary: 'Assign a pending consultation atomically to the current doctor',
  })
  @ApiOkResponse({ description: 'Consultation assigned to the doctor' })
  @ApiConflictResponse({
    description: 'The consultation was already assigned or is not pending',
  })
  assign(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
  ) {
    return this.consultationsService.assign(consultationId, req.user!);
  }

  @Patch(':consultationId/close')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  @ApiOperation({ summary: 'Close an assigned consultation' })
  @ApiOkResponse({
    description: 'Consultation closed and outbox event emitted',
  })
  close(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
    @Body() dto: CloseConsultationDto,
  ) {
    return this.consultationsService.close(
      consultationId,
      req.user!,
      dto,
      req.correlationId,
    );
  }

  @Post(':consultationId/summary/generate')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  generateSummary(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
  ) {
    return this.consultationsService.generateSummary(consultationId, req.user!);
  }

  @Patch(':consultationId/summary/feedback')
  @Roles(UserRole.DOCTOR)
  @UseGuards(DoctorVerifiedGuard)
  submitSummaryFeedback(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
    @Body() dto: SummaryFeedbackDto,
  ) {
    return this.consultationsService.submitSummaryFeedback(
      consultationId,
      req.user!,
      dto,
    );
  }

  @Get(':consultationId/messages')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT, UserRole.ADMIN)
  getMessages(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.consultationsService.getMessages(
      consultationId,
      req.user!,
      limit ? Number(limit) : undefined,
    );
  }

  @Post(':consultationId/rate')
  @Roles(UserRole.PATIENT)
  rate(
    @Req() req: RequestContext,
    @Param('consultationId') consultationId: string,
    @Body() dto: RateConsultationDto,
  ) {
    return this.consultationsService.rate(consultationId, req.user!, dto);
  }
}
