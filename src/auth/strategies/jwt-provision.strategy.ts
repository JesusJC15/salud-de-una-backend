import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import * as jwksRsa from 'jwks-rsa';
import { AUTH0_CLAIM_NS, Auth0JwtPayload } from './jwt.strategy';

export interface ProvisionUser {
  auth0UserId: string;
  email: string;
}

// Strategy used exclusively on POST /auth/provision/* endpoints.
// Validates the Auth0 token signature but does NOT require the db_id claim
// (which is absent on first login before provisioning completes).
//
// Email extraction order:
//   1. Custom claim added by an Auth0 Action (recommended).
//   2. Standard "email" field in the access token (uncommon with API audiences).
//   3. Fallback: calls Auth0 /userinfo with the same validated token — secure
//      because we reuse the already-verified Bearer token.
@Injectable()
export class JwtProvisionStrategy extends PassportStrategy(
  Strategy,
  'jwt-provision',
) {
  private readonly domain: string;

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
      passReqToCallback: true,
    });

    this.domain = domain;
  }

  async validate(req: Request, payload: Auth0JwtPayload): Promise<ProvisionUser> {
    let email =
      (payload[`${AUTH0_CLAIM_NS}email`] as string | undefined) ??
      payload.email ??
      '';

    if (!email) {
      const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      if (rawToken) {
        try {
          const res = await fetch(`https://${this.domain}/userinfo`, {
            headers: { Authorization: `Bearer ${rawToken}` },
          });
          if (res.ok) {
            const userInfo = (await res.json()) as { email?: string };
            email = userInfo.email ?? '';
          }
        } catch {
          // userinfo call failed; controller will throw with a clear message
        }
      }
    }

    return {
      auth0UserId: payload.sub,
      email,
    };
  }
}
