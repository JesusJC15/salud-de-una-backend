import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { RequestContext } from '../interfaces/request-context.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestContext>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : 'Error interno del servidor';
    const endpoint = request.originalUrl ?? request.url;
    const method = request.method;
    const correlationId =
      request.correlationId ??
      request.headers['x-correlation-id']?.toString() ??
      randomUUID();
    const role = request.user?.role ?? 'ANON';
    const userId = request.user?.userId ?? 'anonymous';
    let errorCode = 'UnhandledException';
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'error' in exceptionResponse &&
      typeof (exceptionResponse as { error?: unknown }).error === 'string'
    ) {
      errorCode = (exceptionResponse as { error: string }).error;
    } else if (exception instanceof Error) {
      errorCode = exception.name;
    }

    const extraFields =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? Object.fromEntries(
            Object.entries(exceptionResponse).filter(
              ([key]) => !['statusCode', 'message'].includes(key),
            ),
          )
        : {};

    response.setHeader('x-correlation-id', correlationId);
    this.logger.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'api',
        endpoint_or_event: `${method} ${endpoint}`,
        correlation_id: correlationId,
        user_id: userId,
        role,
        status_code: status,
        error_code: errorCode,
        error_message: message,
      }),
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...extraFields,
      path: endpoint,
      timestamp: new Date().toISOString(),
      correlation_id: correlationId,
    });
  }
}
