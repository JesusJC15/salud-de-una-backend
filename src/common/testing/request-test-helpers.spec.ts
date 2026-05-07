import { UserRole } from '../enums/user-role.enum';
import { buildRequestContext, buildRequestUser } from './request-test-helpers';

describe('request-test-helpers', () => {
  it('buildRequestUser should provide typed defaults', () => {
    expect(buildRequestUser()).toEqual({
      userId: 'user-1',
      email: 'user-1@test.com',
      role: UserRole.PATIENT,
      isActive: true,
    });
  });

  it('buildRequestUser should preserve explicit overrides', () => {
    expect(
      buildRequestUser({
        userId: 'doctor-1',
        email: 'doctor@example.com',
        role: UserRole.DOCTOR,
        isActive: false,
      }),
    ).toEqual({
      userId: 'doctor-1',
      email: 'doctor@example.com',
      role: UserRole.DOCTOR,
      isActive: false,
    });
  });

  it('buildRequestContext should build a request user and keep correlation id', () => {
    const context = buildRequestContext({
      user: { userId: 'admin-1', role: UserRole.ADMIN },
      correlationId: 'corr-123',
    });

    expect(context.user).toEqual({
      userId: 'admin-1',
      email: 'admin-1@test.com',
      role: UserRole.ADMIN,
      isActive: true,
    });
    expect(context.correlationId).toBe('corr-123');
  });
});
