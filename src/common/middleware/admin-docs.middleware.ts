import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

type AdminDocsJwtPayload = {
  sub?: string;
  email?: string;
  role: string;
  iat?: number;
  exp?: number;
};

type RequestWithUser = Request & {
  user?: AdminDocsJwtPayload;
};

@Injectable()
export class AdminDocsMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: RequestWithUser, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException(
        'Missing authorization header. Use: Authorization: Bearer <token>',
      );
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    try {
      const decoded = this.jwtService.verify<AdminDocsJwtPayload>(token);

      if (decoded.role !== 'ADMIN') {
        throw new ForbiddenException(
          `Only ADMIN users can access API documentation. Your role: ${decoded.role}`,
        );
      }

      req.user = decoded;
      next();
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Invalid token';
      throw new UnauthorizedException(`Invalid or expired token: ${message}`);
    }
  }
}
