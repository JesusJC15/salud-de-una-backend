import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutboxModule } from '../outbox/outbox.module';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { Doctor, DoctorSchema } from './schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationSchema,
} from './schemas/rethus-verification.schema';

@Module({
  imports: [
    OutboxModule,
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: RethusVerification.name, schema: RethusVerificationSchema },
    ]),
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [MongooseModule],
})
export class DoctorsModule {}
