import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: { listDoctorsForReview: jest.Mock; verifyDoctor: jest.Mock };

  beforeEach(async () => {
    service = {
      listDoctorsForReview: jest.fn(),
      verifyDoctor: jest.fn(),
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

  it('verifyDoctor should call service', async () => {
    service.verifyDoctor.mockResolvedValue({ doctorId: 'd1' });

    const result = await controller.verifyDoctor(
      'd1',
      { programType: 'UNIVERSITY' } as any,
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
      expect.any(Object),
      expect.objectContaining({ userId: 'a1' }),
    );
    expect(result).toEqual({ doctorId: 'd1' });
  });
});
