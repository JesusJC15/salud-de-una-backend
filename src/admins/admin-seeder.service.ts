import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { ProvisioningService } from '../auth/provisioning.service';
import { Admin, AdminDocument } from './schemas/admin.schema';

@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeederService.name);

  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    private readonly configService: ConfigService,
    private readonly provisioningService: ProvisioningService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.configService.get<boolean>('ENABLE_BOOTSTRAP_ADMIN');
    if (!enabled) return;

    const rawEmail = this.configService.get<string>('BOOTSTRAP_ADMIN_EMAIL');
    const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
    const password = this.configService.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    const firstName =
      this.configService.get<string>('BOOTSTRAP_ADMIN_FIRST_NAME') ?? 'Admin';
    const lastName =
      this.configService.get<string>('BOOTSTRAP_ADMIN_LAST_NAME') ?? 'System';

    if (!email || !password) {
      this.logger.warn('Bootstrap admin habilitado sin email/password.');
      return;
    }

    const existingAdmin = await this.adminModel.findOne({ email }).exec();
    if (existingAdmin) {
      // Already in MongoDB — ensure they also exist in Auth0
      await this.syncAdminToAuth0(
        existingAdmin.id,
        email,
        password,
        firstName,
        lastName,
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await this.adminModel.create({
      firstName,
      lastName,
      email,
      passwordHash,
    });

    this.logger.log(`Admin bootstrap creado en MongoDB para ${email}`);

    await this.syncAdminToAuth0(admin.id, email, password, firstName, lastName);
  }

  // Creates (or updates) the admin user in Auth0 and links them to the MongoDB doc.
  private async syncAdminToAuth0(
    mongoDbId: string,
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    const domain = this.configService.get<string>('auth.auth0Domain');
    if (!domain) {
      this.logger.warn(
        'AUTH0_DOMAIN no configurado — el admin bootstrap no se creará en Auth0.',
      );
      return;
    }

    try {
      const token = await this.provisioningService.getManagementTokenPublic();

      // Check if Auth0 user already exists by email
      const searchRes = await fetch(
        `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!searchRes.ok) {
        this.logger.warn(
          `No se pudo buscar el admin en Auth0: ${searchRes.status}`,
        );
        return;
      }

      const existing = (await searchRes.json()) as Array<{ user_id: string }>;

      if (existing.length > 0) {
        // Already exists — update app_metadata and ensure role is assigned
        const auth0UserId = existing[0].user_id;
        await this.provisioningService.setUserDbId(
          auth0UserId,
          mongoDbId,
          UserRole.ADMIN,
        );
        this.logger.log(
          `Admin bootstrap sincronizado en Auth0: ${auth0UserId}`,
        );
        return;
      }

      // Create the user in Auth0 with email+password (Database connection)
      const createRes = await fetch(`https://${domain}/api/v2/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          connection: 'Username-Password-Authentication',
          email,
          password,
          name: `${firstName} ${lastName}`,
          given_name: firstName,
          family_name: lastName,
          app_metadata: {
            db_id: mongoDbId,
            is_active: true,
          },
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.text().catch(() => '');
        this.logger.warn(
          `No se pudo crear el admin en Auth0: ${createRes.status} ${body}`,
        );
        return;
      }

      const created = (await createRes.json()) as { user_id: string };
      await this.provisioningService.setUserDbId(
        created.user_id,
        mongoDbId,
        UserRole.ADMIN,
      );

      this.logger.log(
        `Admin bootstrap creado en Auth0: ${created.user_id} → MongoDB: ${mongoDbId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Error al sincronizar admin bootstrap con Auth0: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
