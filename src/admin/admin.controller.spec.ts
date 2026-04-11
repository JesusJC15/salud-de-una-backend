import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RethusVerifyDto } from './dto/rethus-verify.dto';

describe('AdminController', () => {
  let controller: AdminController;
  let service: {
    listDoctorsForReview: jest.Mock;
    verifyDoctor: jest.Mock;
    listUsers: jest.Mock;
    getUserByRole: jest.Mock;
    updateUserActive: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listDoctorsForReview: jest.fn(),
      verifyDoctor: jest.fn(),
      listUsers: jest.fn(),
      getUserByRole: jest.fn(),
      updateUserActive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('listDoctors should call service', async () => {
    service.listDoctorsForReview.mockResolvedValue({ items: [] });

    const result = await controller.listDoctors({ search: 'ana' });

    expect(service.listDoctorsForReview).toHaveBeenCalledWith({
      search: 'ana',
    });
    expect(result).toEqual({ items: [] });
  });

  it('listDoctorsReviewAlias should call service', async () => {
    service.listDoctorsForReview.mockResolvedValue({ items: [] });

    const result = await controller.listDoctorsReviewAlias({ search: 'ana' });

    expect(service.listDoctorsForReview).toHaveBeenCalledWith({
      search: 'ana',
    });
    expect(result).toEqual({ items: [] });
  });

  it('verifyDoctorLegacy should call service', async () => {
    service.verifyDoctor.mockResolvedValue({ doctorId: 'd1' });
    const dto: RethusVerifyDto = {
      programType: 'UNIVERSITY',
      titleObtainingOrigin: 'LOCAL',
      professionOccupation: 'MEDICO GENERAL',
      startDate: '2024-01-15',
      rethusState: 'VALID',
      administrativeAct: 'ACT-2026-001',
      reportingEntity: 'MINISTERIO DE SALUD',
    };

    const result = await controller.verifyDoctorLegacy('d1', dto, {
      user: {
        userId: 'a1',
        email: 'admin@example.com',
        role: 'ADMIN',
        isActive: true,
      },
    });

    expect(service.verifyDoctor).toHaveBeenCalledWith(
      'd1',
      expect.any(Object),
      expect.objectContaining({ userId: 'a1' }),
      undefined,
    );
    expect(result).toEqual({ doctorId: 'd1' });
  });

  it('verifyDoctor should call service with compact decision dto', async () => {
    service.verifyDoctor.mockResolvedValue({ doctorId: 'd1' });
    const result = await controller.verifyDoctor(
      'd1',
      { action: 'APPROVE', notes: 'ok' },
      {
        user: {
          userId: 'a1',
          email: 'admin@example.com',
          role: 'ADMIN',
          isActive: true,
        },
      },
    );

    expect(service.verifyDoctor).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ action: 'APPROVE' }),
      expect.objectContaining({ userId: 'a1' }),
      undefined,
    );
    expect(result).toEqual({ doctorId: 'd1' });
  });

  it('listUsers should call service', async () => {
    service.listUsers.mockResolvedValue({ items: [] });
    const result = await controller.listUsers({ role: UserRole.DOCTOR });

    expect(service.listUsers).toHaveBeenCalledWith({
      role: UserRole.DOCTOR,
    });
    expect(result).toEqual({ items: [] });
  });

  it('listUsersByRole should call service with role from path', async () => {
    service.listUsers.mockResolvedValue({ items: [] });
    const result = await controller.listUsersByRole(UserRole.DOCTOR, {
      page: 2,
      limit: 5,
    });

    expect(service.listUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      role: UserRole.DOCTOR,
    });
    expect(result).toEqual({ items: [] });
  });

  it('getUserByRole should call service', async () => {
    service.getUserByRole.mockResolvedValue({ id: 'u1' });
    const result = await controller.getUserByRole(UserRole.DOCTOR, 'u1');

    expect(service.getUserByRole).toHaveBeenCalledWith(UserRole.DOCTOR, 'u1');
    expect(result).toEqual({ id: 'u1' });
  });

  it('updateUserActive should call service', async () => {
    service.updateUserActive.mockResolvedValue({ id: 'u1', isActive: false });
    const result = await controller.updateUserActive(UserRole.DOCTOR, 'u1', {
      isActive: false,
    });

    expect(service.updateUserActive).toHaveBeenCalledWith(
      UserRole.DOCTOR,
      'u1',
      { isActive: false },
    );
    expect(result).toEqual({ id: 'u1', isActive: false });
  });
});
