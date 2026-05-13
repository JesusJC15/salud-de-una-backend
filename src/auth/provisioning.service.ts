import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ManagementTokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);
  private managementToken: string | null = null;
  private tokenExpiry = 0;
  private static readonly FETCH_TIMEOUT_MS = 10_000;
  private static readonly MAX_ATTEMPTS = 2;

  constructor(private readonly configService: ConfigService) {}

  async setUserDbId(
    auth0UserId: string,
    mongoDbId: string,
    role: string,
  ): Promise<void> {
    const domain = this.configService.get<string>('auth.auth0Domain');
    if (!domain) return; // Auth0 not configured yet — skip during cutover

    const token = await this.getManagementToken();

    const patchRes = await this.fetchWithPolicy(
      `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          app_metadata: { db_id: mongoDbId, is_active: true },
        }),
      },
      'setUserDbId',
    );

    if (!patchRes.ok) {
      throw new InternalServerErrorException(
        'Error al aprovisionar usuario en Auth0',
      );
    }

    await this.assignRole(auth0UserId, role, token, domain);
  }

  /**
   * Called after manual (email/password) patient registration.
   * Creates the user in Auth0's database connection and sets app_metadata
   * so they can log in via Auth0 immediately after registering manually.
   * Best-effort — logs but never throws, so MongoDB registration always succeeds.
   */
  async createAuth0UserFromManualRegistration(
    email: string,
    password: string,
    dbId: string,
  ): Promise<void> {
    const domain = this.configService.get<string>('auth.auth0Domain');
    if (!domain) return;

    try {
      const token = await this.getManagementToken();

      const createRes = await this.fetchWithPolicy(
        `https://${domain}/api/v2/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            password,
            connection: 'Username-Password-Authentication',
            app_metadata: { db_id: dbId, role: 'PATIENT', is_active: true },
          }),
        },
        'createAuth0UserFromManualRegistration',
      );

      if (!createRes.ok) {
        if (createRes.status === 409) {
          // User already exists in Auth0 (e.g. social login before manual register)
          this.logger.warn(
            `${email} ya existe en Auth0 — se omite creación, se intenta asignar db_id`,
          );
          return;
        }
        const body = await createRes.text().catch(() => '');
        this.logger.error(
          `No se pudo crear ${email} en Auth0: ${createRes.status} ${body}`,
        );
        return;
      }

      const auth0User = (await createRes.json()) as { user_id: string };
      await this.assignRole(auth0User.user_id, 'PATIENT', token, domain);
    } catch (err) {
      this.logger.error(
        'Error inesperado al crear paciente en Auth0 tras registro manual',
        err,
      );
    }
  }

  async deactivateUser(auth0UserId: string): Promise<void> {
    const domain = this.configService.get<string>('auth.auth0Domain');
    if (!domain) return;

    const token = await this.getManagementToken();

    await this.fetchWithPolicy(
      `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          app_metadata: { is_active: false },
        }),
      },
      'deactivateUser',
    );
  }

  private async assignRole(
    auth0UserId: string,
    role: string,
    token: string,
    domain: string,
  ): Promise<void> {
    const roleIds =
      this.configService.get<Record<string, string | undefined>>(
        'auth.auth0RoleIds',
      );
    const roleId = roleIds?.[role];
    if (!roleId) {
      this.logger.warn(
        `AUTH0_ROLE_ID_${role} no configurado — el usuario ${auth0UserId} no recibirá rol en Auth0`,
      );
      return;
    }

    const res = await this.fetchWithPolicy(
      `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}/roles`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roles: [roleId] }),
      },
      'assignRole',
    );

    // 204 = assigned; 409 would mean already assigned (idempotent) — both are OK.
    // Auth0 returns 204 No Content on success and 400/404 on error.
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `Error al asignar rol ${role} en Auth0: ${res.status} ${body}`,
      );
    }
  }

  async getManagementTokenPublic(): Promise<string> {
    return this.getManagementToken();
  }

  private async getManagementToken(): Promise<string> {
    if (this.managementToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.managementToken;
    }

    const domain = this.configService.getOrThrow<string>('auth.auth0Domain');
    const clientId = this.configService.getOrThrow<string>(
      'auth.auth0M2mClientId',
    );
    const clientSecret = this.configService.getOrThrow<string>(
      'auth.auth0M2mClientSecret',
    );

    const res = await this.fetchWithPolicy(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${domain}/api/v2/`,
      }),
    });

    if (!res.ok) {
      throw new InternalServerErrorException(
        'Error al obtener token de gestion de Auth0',
      );
    }

    const data = (await res.json()) as ManagementTokenResponse;
    this.managementToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
    return this.managementToken;
  }

  private async fetchWithPolicy(
    input: string,
    init: RequestInit,
    operation = 'auth0-request',
  ): Promise<Response> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= ProvisioningService.MAX_ATTEMPTS;
      attempt += 1
    ) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        ProvisioningService.FETCH_TIMEOUT_MS,
      );

      try {
        return await fetch(input, {
          ...init,
          signal: controller.signal,
        });
      } catch (error: unknown) {
        lastError = error;
        const isLastAttempt = attempt === ProvisioningService.MAX_ATTEMPTS;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Auth0 ${operation} attempt ${attempt} failed: ${message}`,
        );
        if (isLastAttempt) {
          throw new InternalServerErrorException(
            `Error al completar ${operation} contra Auth0`,
          );
        }
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw new InternalServerErrorException(
      `Error al completar ${operation} contra Auth0: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }
}
