import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Admin, AdminSchema } from '../admins/schemas/admin.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { AuthController } from './auth.controller';
import {
  RefreshSession,
  RefreshSessionSchema,
} from './schemas/refresh-session.schema';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtLegacyStrategy } from './strategies/jwt-legacy.strategy';
import { JwtProvisionStrategy } from './strategies/jwt-provision.strategy';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [
    PassportModule,
    // JwtModule kept for legacy token issuance during cutover window.
    // Remove after all clients migrate to Auth0.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('auth.jwtSecret') ?? 'legacy-disabled',
      }),
    }),
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtLegacyStrategy,
    JwtProvisionStrategy,
    ProvisioningService,
  ],
  exports: [AuthService, ProvisioningService],
})
export class AuthModule {}
