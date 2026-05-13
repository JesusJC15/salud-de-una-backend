import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { AdminDocsMiddleware } from './admin-docs.middleware';

type AdminDocsRequest = Request & {
  user?: {
    role: string;
    sub?: string;
  };
};

describe('AdminDocsMiddleware', () => {
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;
  let middleware: AdminDocsMiddleware;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    };
    middleware = new AdminDocsMiddleware(jwtService as unknown as JwtService);
  });

  const makeRequest = (
    authorization?: string,
  ): { req: AdminDocsRequest; res: Response; next: NextFunction } => ({
    req: {
      headers: authorization ? { authorization } : {},
    } as AdminDocsRequest,
    res: {} as Response,
    next: jest.fn(),
  });

  it('throws Unauthorized when no Authorization header', () => {
    const { req, res, next } = makeRequest();

    expect(() => middleware.use(req, res, next)).toThrow(UnauthorizedException);
  });

  it('accepts Bearer token and sets user when role is ADMIN', () => {
    jwtService.verify.mockReturnValue({
      role: 'ADMIN',
      sub: '1',
    });

    const { req, res, next } = makeRequest('Bearer tok');

    middleware.use(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user?.role).toBe('ADMIN');
    expect(next).toHaveBeenCalled();
  });

  it('throws Forbidden when role is not ADMIN', () => {
    jwtService.verify.mockReturnValue({ role: 'PATIENT' });

    const { req, res, next } = makeRequest('raw-token');

    expect(() => middleware.use(req, res, next)).toThrow(ForbiddenException);
  });

  it('wraps verify errors as Unauthorized', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('boom');
    });

    const { req, res, next } = makeRequest('t');

    expect(() => middleware.use(req, res, next)).toThrow(UnauthorizedException);
  });
});
