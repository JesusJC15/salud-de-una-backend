import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Patient } from '../patients/schemas/patient.schema';
import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;

  const patientModel = {
    findById: jest.fn(),
    updateOne: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        {
          provide: getModelToken(Patient.name),
          useValue: patientModel,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<PushNotificationsService>(PushNotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockPatientLookup(result: unknown, reject = false) {
    const exec = reject
      ? jest.fn().mockRejectedValue(new Error('db fail'))
      : jest.fn().mockResolvedValue(result);

    patientModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec,
    });
  }

  it('returns without sending when there are no valid Expo tokens', async () => {
    mockPatientLookup({
      pushTokens: ['invalid-token'],
    });

    await expect(
      service.sendToUser({
        userId: 'user-1',
        title: 'Hola',
        body: 'Mundo',
      }),
    ).resolves.toEqual({
      sent: 0,
      removedTokens: [],
    });
  });

  it('returns without sending when the Expo endpoint is not configured', async () => {
    mockPatientLookup({
      pushTokens: ['ExpoPushToken[abc]'],
    });
    configService.get.mockReturnValue(undefined);

    await expect(
      service.sendToUser({
        userId: 'user-1',
        title: 'Hola',
        body: 'Mundo',
      }),
    ).resolves.toEqual({
      sent: 0,
      removedTokens: [],
    });
  });

  it('removes invalid tokens reported by Expo and returns sent count', async () => {
    mockPatientLookup({
      pushTokens: ['ExpoPushToken[ok]', 'ExponentPushToken[old]'],
    });
    configService.get.mockImplementation((key: string) => {
      if (key === 'notifications.expoPushEndpoint') {
        return 'https://expo.test/send';
      }
      if (key === 'notifications.expoPushAccessToken') {
        return 'token-123';
      }
      return undefined;
    });
    patientModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [
          { status: 'ok' },
          {
            status: 'error',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.sendToUser({
      userId: 'user-1',
      title: 'Titulo',
      body: 'Mensaje',
      data: { deepLink: '/consultations/1' },
    });

    const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://expo.test/send',
      expect.any(Object),
    );
    expect(requestInit.method).toBe('POST');
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-123',
    );
    expect(patientModel.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { pushTokens: { $in: ['ExponentPushToken[old]'] } } },
    );
    expect(result).toEqual({
      sent: 1,
      removedTokens: ['ExponentPushToken[old]'],
    });
  });

  it('returns zero sent when Expo responds with a non-ok status', async () => {
    mockPatientLookup({
      pushTokens: ['ExpoPushToken[abc]'],
    });
    configService.get.mockImplementation((key: string) =>
      key === 'notifications.expoPushEndpoint'
        ? 'https://expo.test/send'
        : undefined,
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(
      service.sendToUser({
        userId: 'user-1',
        title: 'Hola',
        body: 'Mundo',
      }),
    ).resolves.toEqual({
      sent: 0,
      removedTokens: [],
    });
  });

  it('returns zero sent when the push request throws', async () => {
    mockPatientLookup({
      pushTokens: ['ExpoPushToken[abc]'],
    });
    configService.get.mockImplementation((key: string) =>
      key === 'notifications.expoPushEndpoint'
        ? 'https://expo.test/send'
        : undefined,
    );
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(
      service.sendToUser({
        userId: 'user-1',
        title: 'Hola',
        body: 'Mundo',
      }),
    ).resolves.toEqual({
      sent: 0,
      removedTokens: [],
    });
  });
});
