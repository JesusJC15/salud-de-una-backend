import { Socket } from 'socket.io';

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
