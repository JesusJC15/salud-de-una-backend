import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { RequestContext } from '../interfaces/request-context.interface';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';

@Injectable()
export class DoctorVerifiedGuard implements CanActivate {
  constructor(
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();
    if (request.user?.role !== UserRole.DOCTOR) {
      return true;
    }

    const doctor = await this.doctorModel
      .findById(request.user.userId)
      .select('doctorStatus')
      .lean<{ doctorStatus?: DoctorStatus }>()
      .exec();

    if (!doctor || doctor.doctorStatus !== DoctorStatus.VERIFIED) {
      throw new ForbiddenException(
        'Acceso restringido: verificacion profesional pendiente',
      );
    }

    return true;
  }
}
