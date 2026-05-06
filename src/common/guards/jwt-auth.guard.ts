import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { RequestContext } from '../interfaces/request-context.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const authorization = request.headers?.authorization?.trim();
    if (!authorization?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('No autorizado');
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('No autorizado');
    }

    request.user = await this.authService.authenticateAccessToken(token);
    return true;
  }
}
