import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../../admins/schemas/admin.schema';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { parseCookies } from '../../common/utils/cookie.utils';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import {
  Patient,
  PatientDocument,
} from '../../patients/schemas/patient.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
  ) {
    const extractFromCookie = (request: Request | undefined): string | null => {
      const cookieHeader = request?.headers?.cookie;
      if (!cookieHeader) {
        return null;
      }

      const cookies = parseCookies(cookieHeader);
      const accessCookieName =
        configService.get<string>('web.accessTokenCookieName') ??
        'sdu_access_token';

      return cookies[accessCookieName] ?? null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException(
        'Token invalido o tipo de token no permitido',
      );
    }

    if (!Types.ObjectId.isValid(payload.sub)) {
      throw new UnauthorizedException('Token invalido');
    }

    const baseProjection = 'email role isActive';
    let user: { email: string; role: UserRole; isActive: boolean } | null =
      null;

    if (payload.role === UserRole.PATIENT) {
      user = await this.patientModel
        .findById(payload.sub)
        .select(baseProjection)
        .lean()
        .exec();
    } else if (payload.role === UserRole.DOCTOR) {
      user = await this.doctorModel
        .findById(payload.sub)
        .select(baseProjection)
        .lean()
        .exec();
    } else if (payload.role === UserRole.ADMIN) {
      user = await this.adminModel
        .findById(payload.sub)
        .select(baseProjection)
        .lean()
        .exec();
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token invalido o usuario inactivo');
    }

    return {
      userId: payload.sub,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
