import { Test, TestingModule } from '@nestjs/testing';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { PatientsController } from './patients.controller';
import { UserRole } from '../common/enums/user-role.enum';
import { PatientsService } from './patients.service';

describe('PatientsController', () => {
  let controller: PatientsController;
  let service: {
    getMe: jest.Mock;
    updateMe: jest.Mock;
    updatePushToken: jest.Mock;
    getTimeline: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getMe: jest.fn(),
      updateMe: jest.fn(),
      updatePushToken: jest.fn(),
      getTimeline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [{ provide: PatientsService, useValue: service }],
    }).compile();

    controller = module.get<PatientsController>(PatientsController);
  });

  it('getMe should call service', async () => {
    service.getMe.mockResolvedValue({ id: 'p1' });

    const result = await controller.getMe({
      user: {
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
    } as RequestContext);

    expect(service.getMe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'p1' }),
    );
    expect(result).toEqual({ id: 'p1' });
  });

  it('updateMe should call service', async () => {
    service.updateMe.mockResolvedValue({ id: 'p1', firstName: 'Laura' });

    const result = await controller.updateMe(
      {
        user: {
          userId: 'p1',
          email: 'ana@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
      } as unknown as RequestContext,
      { firstName: 'Laura' },
    );

    expect(service.updateMe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'p1' }),
      { firstName: 'Laura' },
    );
    expect(result).toEqual({ id: 'p1', firstName: 'Laura' });
  });

  it('updatePushToken should call service', async () => {
    service.updatePushToken.mockResolvedValue({ ok: true });

    const req = {
      user: {
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
    } as unknown as RequestContext;

    const dto = { token: 'ExponentPushToken[patient]' };
    const result = await controller.updatePushToken(req, dto);

    expect(service.updatePushToken).toHaveBeenCalledWith(req.user, dto);
    expect(result).toEqual({ ok: true });
  });

  it('getTimeline should call service', async () => {
    service.getTimeline.mockResolvedValue({ items: [], nextCursor: null });

    const req = {
      user: {
        userId: 'doctor-1',
        email: 'doctor@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      },
    } as unknown as RequestContext;
    const query = { limit: 10, cursor: '2025-01-01T00:00:00.000Z' };

    const result = await controller.getTimeline(req, 'patient-1', query);

    expect(service.getTimeline).toHaveBeenCalledWith(
      req.user,
      'patient-1',
      query,
    );
    expect(result).toEqual({ items: [], nextCursor: null });
  });
});
