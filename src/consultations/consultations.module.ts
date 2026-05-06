import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatModule } from '../chat/chat.module';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import { OutboxModule } from '../outbox/outbox.module';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import {
  TriageSession,
  TriageSessionSchema,
} from '../triage/schemas/triage-session.schema';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import {
  Consultation,
  ConsultationSchema,
} from './schemas/consultation.schema';

@Module({
  imports: [
    ChatModule,
    OutboxModule,
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: TriageSession.name, schema: TriageSessionSchema },
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  controllers: [ConsultationsController],
  providers: [DoctorVerifiedGuard, ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
