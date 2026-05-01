import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { AUTH0_CLAIM_NS, Auth0JwtPayload } from './jwt.strategy';

export interface ProvisionUser {
  auth0UserId: string;
  email: string;
}

// Strategy used exclusively on POST /auth/provision/* endpoints.
// Validates the Auth0 token signature but does NOT require the db_id claim
// (which is absent on first login before provisioning completes).
@Injectable()
export class JwtProvisionStrategy extends PassportStrategy(
  Strategy,
  'jwt-provision',
) {
  constructor(configService: ConfigService) {
    const domain =
      configService.get<string>('auth.auth0Domain') ?? 'placeholder.auth0.com';
    const audience = configService.get<string>('auth.auth0Audience') ?? '';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      audience: audience || undefined,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  validate(payload: Auth0JwtPayload): ProvisionUser {
    const email =
      (payload[`${AUTH0_CLAIM_NS}email`] as string | undefined) ??
      payload.email ??
      '';

    return {
      auth0UserId: payload.sub,
      email,
    };
  }
}
