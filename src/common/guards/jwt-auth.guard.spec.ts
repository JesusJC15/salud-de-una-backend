import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let authService: { authenticateAccessToken: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    authService = { authenticateAccessToken: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: reflector },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  function createContext(authorization?: string): ExecutionContext {
    const request = {
      headers: authorization ? { authorization } : {},
    };

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('should allow public routes without calling passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    return expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('should authenticate bearer tokens on non-public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.authenticateAccessToken.mockResolvedValue({
      userId: 'u1',
      email: 'doctor@example.com',
      role: 'DOCTOR',
      isActive: true,
    });

    const result = await guard.canActivate(createContext('Bearer token-123'));

    expect(authService.authenticateAccessToken).toHaveBeenCalledWith(
      'token-123',
    );
    expect(result).toBe(true);
  });

  it('should reject missing bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
