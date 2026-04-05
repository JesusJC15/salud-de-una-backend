import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../admins/schemas/admin.schema';
import {
  RefreshSession,
  RefreshSessionSchema,
} from '../auth/schemas/refresh-session.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationSchema,
} from '../doctors/schemas/rethus-verification.schema';
import { OutboxModule } from '../outbox/outbox.module';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    OutboxModule,
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: RethusVerification.name, schema: RethusVerificationSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
