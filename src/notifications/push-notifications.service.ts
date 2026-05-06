import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';

type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoTicket = {
  status?: string;
  details?: {
    error?: string;
  };
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    private readonly configService: ConfigService,
  ) {}

  async sendToUser(input: PushPayload) {
    const patient = await this.patientModel
      .findById(input.userId)
      .select('pushTokens')
      .lean()
      .exec()
      .catch(() => null);

    const tokens = (patient?.pushTokens ?? []).filter((token) =>
      this.isExpoPushToken(token),
    );

    if (tokens.length === 0) {
      return { sent: 0, removedTokens: [] as string[] };
    }

    const endpoint = this.configService.get<string>(
      'notifications.expoPushEndpoint',
    );
    if (!endpoint) {
      return { sent: 0, removedTokens: [] as string[] };
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };

    const accessToken = this.configService.get<string>(
      'notifications.expoPushAccessToken',
    );
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    }));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        this.logger.warn(
          `Expo push respondio ${response.status} para userId=${input.userId}`,
        );
        return { sent: 0, removedTokens: [] as string[] };
      }

      const payload = (await response.json().catch(() => null)) as {
        data?: ExpoTicket[];
      } | null;
      const tickets = payload?.data ?? [];
      const invalidTokens = tokens.filter((token, index) => {
        const ticket = tickets[index];
        return (
          ticket?.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        );
      });

      if (invalidTokens.length > 0) {
        await this.patientModel
          .updateOne(
            { _id: input.userId },
            { $pull: { pushTokens: { $in: invalidTokens } } },
          )
          .exec();
      }

      return {
        sent: tokens.length - invalidTokens.length,
        removedTokens: invalidTokens,
      };
    } catch (error) {
      this.logger.warn(
        `Fallo el envio push para userId=${input.userId}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return { sent: 0, removedTokens: [] as string[] };
    }
  }

  private isExpoPushToken(token: string) {
    return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
  }
}
