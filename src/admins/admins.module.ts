import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminSeederService } from './admin-seeder.service';
import { Admin, AdminSchema } from './schemas/admin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
    AuthModule,
  ],
  providers: [AdminSeederService],
  exports: [MongooseModule],
})
export class AdminsModule {}
