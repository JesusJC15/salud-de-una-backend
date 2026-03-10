import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import { parseCookies } from '../utils/cookie.utils';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.isSafeMethod(request.method)) {
      return true;
    }

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf) {
      return true;
    }

    const cookieHeader = request.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const accessCookieName = this.configService.get<string>(
      'web.accessTokenCookieName',
    );
    const refreshCookieName = this.configService.get<string>(
      'web.refreshTokenCookieName',
    );
    const csrfCookieName = this.configService.get<string>('web.csrfCookieName');
    const csrfHeaderName = (
      this.configService.get<string>('web.csrfHeaderName') ?? 'x-csrf-token'
    ).toLowerCase();

    const hasSessionCookie = Boolean(
      (accessCookieName && cookies[accessCookieName]) ||
      (refreshCookieName && cookies[refreshCookieName]),
    );

    const requiresPublicCsrf =
      request.originalUrl?.includes('/auth/refresh') ||
      request.originalUrl?.includes('/auth/logout');

    if (!hasSessionCookie && !requiresPublicCsrf) {
      return true;
    }

    const cookieToken = csrfCookieName ? cookies[csrfCookieName] : undefined;
    const headerValue = request.headers[csrfHeaderName];
    const headerToken =
      typeof headerValue === 'string' ? headerValue : headerValue?.[0];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new BadRequestException('CSRF token invalido o ausente');
    }

    return true;
  }

  private isSafeMethod(method: string): boolean {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }
}
