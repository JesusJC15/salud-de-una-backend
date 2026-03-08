import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from './schemas/admin.schema';

@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeederService.name);

  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.configService.get<boolean>('ENABLE_BOOTSTRAP_ADMIN');
    if (!enabled) {
      return;
    }

    const email = this.configService.get<string>('BOOTSTRAP_ADMIN_EMAIL');
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
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.adminModel.create({
      firstName,
      lastName,
      email,
      passwordHash,
    });

    this.logger.log(`Admin bootstrap creado para ${email}`);
  }
}
