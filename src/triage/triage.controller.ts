import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { CreateTriageSessionDto } from './dto/create-triage-session.dto';
import { GetActiveTriageSessionsDto } from './dto/get-active-triage-sessions.dto';
import { SaveTriageAnswersDto } from './dto/save-triage-answers.dto';
import { TriageService } from './triage.service';

@ApiTags('Triage')
@ApiBearerAuth()
@Controller('triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('sessions')
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Crear sesion de triage',
    description:
      'Crea una sesion en estado IN_PROGRESS para el paciente autenticado y la especialidad indicada.',
  })
  @ApiCreatedResponse({
    description: 'Sesion creada correctamente',
    schema: {
      example: {
        sessionId: '680f0493bba79f530f7486f1',
        specialty: 'GENERAL_MEDICINE',
        status: 'IN_PROGRESS',
        questions: [
          {
            questionId: 'MG-Q1',
            questionText: 'Cual es tu sintoma principal?',
          },
        ],
        totalQuestions: 5,
        answeredCount: 0,
        remainingQuestions: 5,
        progressPercent: 0,
        nextQuestionId: 'MG-Q1',
        isComplete: false,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Payload invalido o specialty fuera del enum permitido',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'specialty must be one of the following values: GENERAL_MEDICINE, ODONTOLOGY',
        ],
        path: '/v1/triage/sessions',
        timestamp: '2026-04-07T18:20:00.000Z',
        correlation_id: 'c4f8d2e0-2b85-4b3e-94c0-2d0cb03c34fd',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({
    description: 'El usuario autenticado no tiene rol PATIENT',
  })
  @ApiConflictResponse({
    description:
      'Ya existe una sesion IN_PROGRESS para patient+specialty; usar existingSessionId para reanudar',
    schema: {
      example: {
        statusCode: 409,
        errorCode: 'TRIAGE_SESSION_IN_PROGRESS',
        specialty: 'GENERAL_MEDICINE',
        existingSessionId: '680f0493bba79f530f7486f1',
        status: 'IN_PROGRESS',
        message: 'Ya existe una sesion de triage en progreso para esta especialidad',
        path: '/v1/triage/sessions',
        timestamp: '2026-04-07T18:20:00.000Z',
        correlation_id: 'e65fd6f0-966d-4d67-9d0b-f0668f752b17',
      },
    },
  })
  createSession(
    @Req() req: RequestContext,
    @Body() dto: CreateTriageSessionDto,
  ) {
    return this.triageService.createSession(req.user!, dto, req.correlationId);
  }

  @Get('sessions/active')
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Listar sesiones activas',
    description:
      'Retorna sesiones IN_PROGRESS del paciente autenticado; opcionalmente filtra por specialty.',
  })
  @ApiOkResponse({
    description: 'Sesiones activas retornadas correctamente',
    schema: {
      example: {
        items: [
          {
            id: '680f0493bba79f530f7486f1',
            specialty: 'GENERAL_MEDICINE',
            status: 'IN_PROGRESS',
            currentStep: 2,
            totalSteps: 5,
            currentQuestionId: 'MG-Q2',
            isComplete: false,
            createdAt: '2026-04-07T18:18:00.000Z',
            updatedAt: '2026-04-07T18:19:10.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Filtro de specialty invalido',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'specialty must be one of the following values: GENERAL_MEDICINE, ODONTOLOGY',
        ],
        path: '/v1/triage/sessions/active?specialty=DENTISTRY',
        timestamp: '2026-04-07T18:20:00.000Z',
        correlation_id: '4aafdfd1-4fd2-4f6c-acf5-d74642bdf8d6',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({
    description: 'El usuario autenticado no tiene rol PATIENT',
  })
  getActiveSessions(
    @Req() req: RequestContext,
    @Query() query: GetActiveTriageSessionsDto,
  ) {
    return this.triageService.getActiveSessions(req.user!, query.specialty);
  }

  @Get('sessions/:sessionId')
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Obtener detalle de sesion de triage',
    description:
      'Retorna la sesion de triage del paciente autenticado con metadatos completos de preguntas para hidratar y reanudar el cuestionario en cliente movil.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Id de la sesion de triage',
    example: '680f0493bba79f530f7486f1',
  })
  @ApiOkResponse({
    description: 'Detalle de sesion retornado correctamente',
    schema: {
      example: {
        id: '680f0493bba79f530f7486f1',
        sessionId: '680f0493bba79f530f7486f1',
        specialty: 'GENERAL_MEDICINE',
        status: 'IN_PROGRESS',
        isComplete: false,
        currentQuestionId: 'MG-Q2',
        currentStep: 2,
        totalSteps: 5,
        totalQuestions: 5,
        nextQuestionId: 'MG-Q2',
        questions: [
          {
            id: 'MG-Q1',
            questionId: 'MG-Q1',
            title: 'Sintoma principal',
            questionText: 'Que sintoma principal presentas hoy?',
            description:
              'Selecciona el sintoma que describe mejor tu situacion.',
            type: 'SINGLE_CHOICE',
            options: [
              {
                id: 'MG-Q1-HEADACHE',
                label: 'Dolor de cabeza',
              },
            ],
          },
          {
            id: 'MG-Q3',
            questionId: 'MG-Q3',
            title: 'Intensidad de sintomas',
            questionText: 'En una escala de 0 a 10, cual es la intensidad?',
            type: 'NUMERIC_SCALE',
            minValue: 0,
            maxValue: 10,
            step: 1,
          },
        ],
        createdAt: '2026-04-07T18:18:00.000Z',
        updatedAt: '2026-04-07T18:19:10.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({
    description: 'El usuario autenticado no tiene rol PATIENT',
  })
  @ApiNotFoundResponse({
    description: 'Sesion no encontrada o no pertenece al paciente',
    schema: {
      example: {
        statusCode: 404,
        message: 'Sesion de triage no encontrada',
        path: '/v1/triage/sessions/680f0493bba79f530f7486f1',
        timestamp: '2026-04-07T18:20:00.000Z',
        correlation_id: '434e43f6-c73f-4b0f-a2da-07cd6b1dc148',
      },
    },
  })
  getSessionDetail(@Req() req: RequestContext, @Param('sessionId') sessionId: string) {
    return this.triageService.getSessionDetail(sessionId, req.user!);
  }

  @Post('sessions/:sessionId/answers')
  @HttpCode(200)
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Guardar respuestas de triage' })
  @ApiOkResponse({
    description: 'Respuestas guardadas y progreso actualizado',
    schema: {
      example: {
        sessionId: '680f0493bba79f530f7486f1',
        answersCount: 2,
        isComplete: false,
        totalQuestions: 5,
        answeredCount: 2,
        remainingQuestions: 3,
        progressPercent: 40,
        nextQuestionId: 'MG-Q3',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Payload invalido o estado no permitido' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({ description: 'El usuario autenticado no tiene rol PATIENT' })
  @ApiNotFoundResponse({ description: 'Sesion no encontrada o no pertenece al paciente' })
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
  @ApiOperation({ summary: 'Analizar sesion de triage' })
  @ApiOkResponse({
    description: 'Sesion analizada y caso enviado a cola medica',
    schema: {
      example: {
        sessionId: '680f0493bba79f530f7486f1',
        priority: 'MODERATE',
        redFlags: [],
        message: 'Analisis de triage completado. Tu caso fue enviado a la cola medica.',
        highPriorityAlert: false,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Sesion invalida o no en progreso' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({ description: 'El usuario autenticado no tiene rol PATIENT' })
  @ApiNotFoundResponse({ description: 'Sesion no encontrada o no pertenece al paciente' })
  @ApiUnprocessableEntityResponse({ description: 'La sesion no tiene todas las respuestas requeridas' })
  @ApiServiceUnavailableResponse({
    description: 'Dependencia de analisis no disponible o ruleset ausente',
    schema: {
      example: {
        statusCode: 503,
        errorCode: 'TRIAGE_ANALYSIS_DEPENDENCY_UNAVAILABLE',
        specialty: 'GENERAL_MEDICINE',
        sessionId: '680f0493bba79f530f7486f1',
        message: 'No fue posible completar el analisis de triage en este momento',
        path: '/v1/triage/sessions/680f0493bba79f530f7486f1/analyze',
        timestamp: '2026-04-11T10:00:00.000Z',
        correlation_id: 'mobile-mntx90rg-gpe1oido',
      },
    },
  })
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

  @Patch('sessions/:sessionId/cancel')
  @HttpCode(200)
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Cancelar sesion de triage en progreso' })
  @ApiOkResponse({
    description: 'Sesion cancelada correctamente',
    schema: {
      example: {
        sessionId: '680f0493bba79f530f7486f1',
        specialty: 'GENERAL_MEDICINE',
        status: 'CANCELED',
        canceledAt: '2026-04-07T18:20:00.000Z',
        message: 'Sesion de triage cancelada correctamente',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'La sesion no esta en estado IN_PROGRESS',
    schema: {
      example: {
        statusCode: 400,
        message: 'Solo se pueden cancelar sesiones en progreso',
        path: '/v1/triage/sessions/680f0493bba79f530f7486f1/cancel',
        timestamp: '2026-04-07T18:20:00.000Z',
        correlation_id: '09f80178-6f68-4967-a7ec-6016ea03d11a',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o invalido' })
  @ApiForbiddenResponse({ description: 'El usuario autenticado no tiene rol PATIENT' })
  @ApiNotFoundResponse({ description: 'Sesion no encontrada o no pertenece al paciente' })
  cancelSession(@Req() req: RequestContext, @Param('sessionId') sessionId: string) {
    return this.triageService.cancelSession(sessionId, req.user!, req.correlationId);
  }
}
