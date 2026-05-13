import { Socket } from 'socket.io';

/**
 * Builds a Socket.io CORS origin callback that validates against allowed origins
 * loaded from CORS_ORIGINS_PATIENT and CORS_ORIGINS_STAFF env vars at call time.
 * Used in @WebSocketGateway decorators where ConfigService is not yet available.
 */
export function buildSocketCorsOriginFn(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const patient =
      process.env.CORS_ORIGINS_PATIENT?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const staff =
      process.env.CORS_ORIGINS_STAFF?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const allowed = [...new Set([...patient, ...staff])];
    if (allowed.length === 0 && process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    callback(null, allowed.includes(origin));
  };
}

export function extractSocketToken(client: Socket): string | null {
  const auth = client.handshake.auth as Record<string, unknown> | undefined;
  const authToken = auth?.token;
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.trim();
  }

  const authorization = client.handshake.headers.authorization;
  if (
    typeof authorization === 'string' &&
    authorization.toLowerCase().startsWith('bearer ')
  ) {
    return authorization.slice(7).trim();
  }

  return null;
}
