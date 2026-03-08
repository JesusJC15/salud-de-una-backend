import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { DashboardService } from '../../dashboard/dashboard.service';
import { RequestContext } from '../interfaces/request-context.interface';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  constructor(private readonly dashboardService: DashboardService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
      statusCode: number;
    }>();

    const correlationId =
      request.headers['x-correlation-id']?.toString() ?? randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const startedAt = Date.now();
    const method = request.method;
    const endpoint = request.originalUrl ?? request.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const latencyMs = Date.now() - startedAt;
          const role = request.user?.role ?? 'ANON';
          const userId = request.user?.userId ?? 'anonymous';
          const statusCode = response.statusCode;

          this.dashboardService.record({ latencyMs, statusCode });
          this.logger.log(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              service: 'api',
              endpoint_or_event: `${method} ${endpoint}`,
              correlation_id: correlationId,
              user_id: userId,
              role,
              latency_ms: latencyMs,
              status_code: statusCode,
            }),
          );
        },
        error: (error: unknown) => {
          const latencyMs = Date.now() - startedAt;
          const role = request.user?.role ?? 'ANON';
          const userId = request.user?.userId ?? 'anonymous';
          const statusCode =
            error instanceof HttpException
              ? error.getStatus()
              : HttpStatus.INTERNAL_SERVER_ERROR;

          this.dashboardService.record({ latencyMs, statusCode });
          this.logger.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              service: 'api',
              endpoint_or_event: `${method} ${endpoint}`,
              correlation_id: correlationId,
              user_id: userId,
              role,
              latency_ms: latencyMs,
              status_code: statusCode,
              error_code:
                error instanceof Error ? error.name : 'UnhandledException',
              error_message:
                error instanceof Error ? error.message : String(error),
            }),
          );
        },
      }),
    );
  }
}
