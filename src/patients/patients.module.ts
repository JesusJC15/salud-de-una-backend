import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { Followup, FollowupSchema } from '../followups/schemas/followup.schema';
import {
  TriageSession,
  TriageSessionSchema,
} from '../triage/schemas/triage-session.schema';
import {
  Transaction,
  TransactionSchema,
} from '../billing/schemas/transaction.schema';
import { PatientTimelineService } from './patient-timeline.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { Patient, PatientSchema } from './schemas/patient.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: TriageSession.name, schema: TriageSessionSchema },
      { name: Followup.name, schema: FollowupSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientTimelineService],
  exports: [MongooseModule, PatientsService],
})
export class PatientsModule {}
