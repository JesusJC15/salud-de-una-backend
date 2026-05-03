import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import {
  TriageSession,
  TriageSessionSchema,
} from '../triage/schemas/triage-session.schema';
import {
  ConsultationMessage,
  ConsultationMessageSchema,
} from '../chat/schemas/consultation-message.schema';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import {
  Consultation,
  ConsultationSchema,
} from './schemas/consultation.schema';

@Module({
  imports: [
    AiModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: ConsultationMessage.name, schema: ConsultationMessageSchema },
      // Register TriageSession schema directly to avoid circular dependency
      // with TriageModule (which imports ConsultationsModule).
      { name: TriageSession.name, schema: TriageSessionSchema },
    ]),
  ],
  controllers: [ConsultationsController],
  providers: [DoctorVerifiedGuard, ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
