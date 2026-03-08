import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorVerifiedGuard } from '../common/guards/doctor-verified.guard';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { ConsultationsController } from './consultations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Doctor.name, schema: DoctorSchema }]),
  ],
  controllers: [ConsultationsController],
  providers: [DoctorVerifiedGuard],
})
export class ConsultationsModule {}
