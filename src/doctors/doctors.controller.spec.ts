import { Test, TestingModule } from '@nestjs/testing';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

describe('DoctorsController', () => {
  let controller: DoctorsController;
  let service: { getMe: jest.Mock };

  beforeEach(async () => {
    service = { getMe: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorsController],
      providers: [{ provide: DoctorsService, useValue: service }],
    }).compile();

    controller = module.get<DoctorsController>(DoctorsController);
  });

  it('getMe should call service', async () => {
    service.getMe.mockResolvedValue({ id: 'd1' });

    const result = await controller.getMe({
      user: {
        userId: 'd1',
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
    });

    expect(service.getMe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'd1' }),
    );
    expect(result).toEqual({ id: 'd1' });
  });
});
