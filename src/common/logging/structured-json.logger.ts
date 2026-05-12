import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

type LogPayload = {
  timestamp: string;
  level: string;
  context?: string;
  message?: string;
  stack?: string;
  pid: number;
  runtime_role: string;
} & Record<string, unknown>;

@Injectable()
export class StructuredJsonLogger extends ConsoleLogger {
  constructor(context?: string) {
    super(context ?? StructuredJsonLogger.name, {
      logLevels: StructuredJsonLogger.defaultLogLevels(),
    });
  }

  override log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack, process.stderr);
  }

  override warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'verbose',
    message: unknown,
    context?: string,
    stack?: string,
    stream: NodeJS.WriteStream = process.stdout,
  ) {
    const payload = this.buildPayload(level, message, context, stack);
    stream.write(`${JSON.stringify(payload)}\n`);
  }

  private buildPayload(
    level: 'info' | 'error' | 'warn' | 'debug' | 'verbose',
    message: unknown,
    context?: string,
    stack?: string,
  ): LogPayload {
    const normalized = this.normalizeMessage(message);

    return {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context,
      pid: process.pid,
      runtime_role: process.env.APP_RUNTIME_ROLE ?? 'all',
      ...normalized,
      ...(stack ? { stack } : {}),
    };
  }

  private normalizeMessage(message: unknown): Record<string, unknown> {
    if (typeof message === 'string') {
      const trimmed = message.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          return { message };
        }
      }

      return { message };
    }

    if (message instanceof Error) {
      return {
        message: message.message,
        error_name: message.name,
        ...(message.stack ? { stack: message.stack } : {}),
      };
    }

    if (message && typeof message === 'object' && !Array.isArray(message)) {
      return message as Record<string, unknown>;
    }

    return { message: String(message) };
  }

  private static defaultLogLevels(): LogLevel[] {
    return ['log', 'error', 'warn', 'debug', 'verbose'];
  }
}
