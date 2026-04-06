import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
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

  function createContext(): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
  }

  it('should allow public routes without calling passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const result = guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('should delegate to passport for non-public routes', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const spy = jest.spyOn(parent, 'canActivate').mockReturnValue(true);

    const result = guard.canActivate(createContext());

    expect(spy).toHaveBeenCalled();
    expect(result).toBe(true);
    spy.mockRestore();
  });

  it('handleRequest should throw when user is missing', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest should return user when present', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user, null)).toBe(user);
  });
});
