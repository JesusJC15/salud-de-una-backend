import { registerAs } from '@nestjs/config';

export default registerAs('notifications', () => ({
  expoPushEndpoint:
    process.env.EXPO_PUSH_ENDPOINT?.trim() ||
    'https://exp.host/--/api/v2/push/send',
  expoPushAccessToken: process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() ?? '',
}));
