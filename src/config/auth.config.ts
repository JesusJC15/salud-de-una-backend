import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  // Auth0 Resource Server validation
  auth0Domain: process.env.AUTH0_DOMAIN,
  auth0Audience: process.env.AUTH0_AUDIENCE,

  // Auth0 Management API M2M (provisioning only — never expose to clients)
  auth0M2mClientId: process.env.AUTH0_M2M_CLIENT_ID,
  auth0M2mClientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,

  // Auth0 Role IDs (from dashboard: User Management → Roles → copy ID)
  auth0RoleIds: {
    PATIENT: process.env.AUTH0_ROLE_ID_PATIENT,
    DOCTOR: process.env.AUTH0_ROLE_ID_DOCTOR,
    ADMIN: process.env.AUTH0_ROLE_ID_ADMIN,
  },

  // Legacy JWT — kept during cutover window; remove after all tokens expire
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
