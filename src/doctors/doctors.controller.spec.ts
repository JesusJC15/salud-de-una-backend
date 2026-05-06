import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DoctorAvailability } from '../common/enums/doctor-availability.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

const mockGuard: CanActivate = { canActivate: () => true };

describe('DoctorsController', () => {
  let controller: DoctorsController;
  let service: {
    getMe: jest.Mock;
    rethusResubmit: jest.Mock;
    updateAvailability: jest.Mock;
    updatePushToken: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getMe: jest.fn(),
      rethusResubmit: jest.fn(),
      updateAvailability: jest.fn(),
      updatePushToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorsController],
      providers: [{ provide: DoctorsService, useValue: service }],
    })
      .overrideGuard(DoctorVerifiedGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<DoctorsController>(DoctorsController);
  });

  it('getMe should call service', async () => {
    service.getMe.mockResolvedValue({ id: 'd1' });

    const result = await controller.getMe({
      user: {
        userId: 'd1',
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      },
    } as unknown as RequestContext);

    expect(service.getMe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'd1' }),
    );
    expect(result).toEqual({ id: 'd1' });
  });

  it('updateAvailability should call service with status', async () => {
    service.updateAvailability.mockResolvedValue({
      availabilityStatus: DoctorAvailability.PAUSED,
    });

    const result = await controller.updateAvailability(
      { status: DoctorAvailability.PAUSED },
      {
        user: {
          userId: 'd1',
          email: 'doc@example.com',
          role: UserRole.DOCTOR,
          isActive: true,
        },
      } as unknown as RequestContext,
    );

    expect(service.updateAvailability).toHaveBeenCalledWith(
      'd1',
      DoctorAvailability.PAUSED,
    );
    expect(result).toEqual({ availabilityStatus: DoctorAvailability.PAUSED });
  });

  it('rethusResubmit should call service', async () => {
    service.rethusResubmit.mockResolvedValue({ doctorId: 'd1' });

    const result = await controller.rethusResubmit(
      { notes: 'nueva evidencia' },
      {
        user: {
          userId: 'd1',
          email: 'doc@example.com',
          role: UserRole.DOCTOR,
          isActive: true,
        },
      } as unknown as RequestContext,
    );

    expect(service.rethusResubmit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'd1' }),
      { notes: 'nueva evidencia' },
      undefined,
    );
    expect(result).toEqual({ doctorId: 'd1' });
  });

  it('updatePushToken should call service with doctor id and token', async () => {
    service.updatePushToken.mockResolvedValue(undefined);

    await expect(
      controller.updatePushToken(
        { token: 'ExponentPushToken[test]' },
        {
          user: {
            userId: 'd1',
            email: 'doc@example.com',
            role: UserRole.DOCTOR,
            isActive: true,
          },
        } as unknown as RequestContext,
      ),
    ).resolves.toBeUndefined();

    expect(service.updatePushToken).toHaveBeenCalledWith(
      'd1',
      'ExponentPushToken[test]',
    );
  });
});
