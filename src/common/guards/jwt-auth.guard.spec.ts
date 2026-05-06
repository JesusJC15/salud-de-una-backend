import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, { provide: Reflector, useValue: reflector }],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  function createContext(authorization?: string): ExecutionContext {
    const request = {
      headers: authorization ? { authorization } : {},
    };
    const response = {};

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows public routes without delegating to passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const parentCanActivate = jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype) as {
        canActivate: (context: ExecutionContext) => unknown;
      },
      'canActivate',
    );

    expect(guard.canActivate(createContext())).toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('delegates non-public routes to passport auth guard', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const parentCanActivate = jest
      .spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype) as {
          canActivate: (context: ExecutionContext) => unknown;
        },
        'canActivate',
      )
      .mockResolvedValue(true);

    await expect(
      Promise.resolve(guard.canActivate(createContext('Bearer token-123'))),
    ).resolves.toBe(true);
    expect(parentCanActivate).toHaveBeenCalledTimes(1);
  });

  it('returns the authenticated user when passport resolves it', () => {
    const user = {
      userId: 'u1',
      email: 'doctor@example.com',
      role: 'DOCTOR',
    };

    expect(guard.handleRequest(null, user, null)).toBe(user);
  });

  it('throws UnauthorizedException when passport returns no user', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('rethrows passport errors for missing or invalid tokens', () => {
    const error = new UnauthorizedException('No autorizado');

    expect(() => guard.handleRequest(error, null, null)).toThrow(error);
  });
});
