import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import {
  Consultation,
  ConsultationSchema,
} from './schemas/consultation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  controllers: [ConsultationsController],
  providers: [DoctorVerifiedGuard, ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
