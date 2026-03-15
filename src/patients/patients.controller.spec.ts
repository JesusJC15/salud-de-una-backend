import { Test, TestingModule } from '@nestjs/testing';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

describe('PatientsController', () => {
  let controller: PatientsController;
  let service: { getMe: jest.Mock; updateMe: jest.Mock };

  beforeEach(async () => {
    service = {
      getMe: jest.fn(),
      updateMe: jest.fn(),
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
        role: 'PATIENT',
        isActive: true,
      },
    });

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
          role: 'PATIENT',
          isActive: true,
        },
      },
      { firstName: 'Laura' },
    );

    expect(service.updateMe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'p1' }),
      { firstName: 'Laura' },
    );
    expect(result).toEqual({ id: 'p1', firstName: 'Laura' });
  });
});
