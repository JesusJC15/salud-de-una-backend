import { AdminDocsMiddleware } from './admin-docs.middleware';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';

describe('AdminDocsMiddleware', () => {
  let jwtService: Partial<JwtService>;
  let middleware: AdminDocsMiddleware;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    };
    middleware = new AdminDocsMiddleware(jwtService as JwtService);
  });

  it('throws Unauthorized when no Authorization header', () => {
    const req: any = { headers: {} };
    expect(() => middleware.use(req, {} as any, () => {})).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts Bearer token and sets user when role is ADMIN', () => {
    const token = 'tok';
    (jwtService.verify as jest.Mock).mockReturnValue({
      role: 'ADMIN',
      sub: '1',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    middleware.use(req, {} as any, next);
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('ADMIN');
    expect(next).toHaveBeenCalled();
  });

  it('throws Forbidden when role is not ADMIN', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({ role: 'PATIENT' });
    const req: any = { headers: { authorization: 'raw-token' } };
    expect(() => middleware.use(req, {} as any, () => {})).toThrow(
      ForbiddenException,
    );
  });

  it('wraps verify errors as Unauthorized', () => {
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    const req: any = { headers: { authorization: 't' } };
    expect(() => middleware.use(req, {} as any, () => {})).toThrow(
      UnauthorizedException,
    );
  });
});
