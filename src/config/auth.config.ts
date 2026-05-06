import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  auth0Domain: process.env.AUTH0_DOMAIN ?? '',
  auth0Audience: process.env.AUTH0_AUDIENCE ?? '',
  auth0Issuer: process.env.AUTH0_ISSUER ?? '',
}));
