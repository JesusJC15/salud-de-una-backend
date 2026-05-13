import notificationsConfig from './notifications.config';

describe('notifications.config', () => {
  const originalEndpoint = process.env.EXPO_PUSH_ENDPOINT;
  const originalToken = process.env.EXPO_PUSH_ACCESS_TOKEN;

  afterEach(() => {
    process.env.EXPO_PUSH_ENDPOINT = originalEndpoint;
    process.env.EXPO_PUSH_ACCESS_TOKEN = originalToken;
  });

  it('uses the configured env vars when present', () => {
    process.env.EXPO_PUSH_ENDPOINT = ' https://expo.test/send ';
    process.env.EXPO_PUSH_ACCESS_TOKEN = ' token-123 ';

    const config = notificationsConfig();

    expect(config.expoPushEndpoint).toBe('https://expo.test/send');
    expect(config.expoPushAccessToken).toBe('token-123');
  });

  it('falls back to defaults when env vars are absent', () => {
    delete process.env.EXPO_PUSH_ENDPOINT;
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;

    const config = notificationsConfig();

    expect(config.expoPushEndpoint).toBe(
      'https://exp.host/--/api/v2/push/send',
    );
    expect(config.expoPushAccessToken).toBe('');
  });

  it('handles whitespace-only env vars and trims them', () => {
    process.env.EXPO_PUSH_ENDPOINT = '   ';
    process.env.EXPO_PUSH_ACCESS_TOKEN = '  ';

    const config = notificationsConfig();

    expect(config.expoPushEndpoint).toBe(
      'https://exp.host/--/api/v2/push/send',
    );
    expect(config.expoPushAccessToken).toBe('');
  });
});
