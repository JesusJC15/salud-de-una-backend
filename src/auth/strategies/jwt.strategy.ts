import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../../admins/schemas/admin.schema';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import {
  Patient,
  PatientDocument,
} from '../../patients/schemas/patient.schema';

export const AUTH0_CLAIM_NS = 'https://salud-de-una.com/';

export interface Auth0JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  email?: string;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
  ) {
    const domain =
      configService.get<string>('auth.auth0Domain') ?? 'placeholder.auth0.com';
    const audience = configService.get<string>('auth.auth0Audience') ?? '';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      audience: audience || undefined,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: Auth0JwtPayload): Promise<RequestUser> {
    const dbId = payload[`${AUTH0_CLAIM_NS}db_id`] as string | undefined;
    const role = payload[`${AUTH0_CLAIM_NS}role`] as UserRole | undefined;
    const isActiveFromToken =
      (payload[`${AUTH0_CLAIM_NS}is_active`] as boolean | undefined) ?? true;

    if (!dbId) {
      throw new UnauthorizedException('Usuario no aprovisionado');
    }

    if (!Types.ObjectId.isValid(dbId)) {
      throw new UnauthorizedException('ID de usuario invalido en token');
    }

    if (!role || !Object.values(UserRole).includes(role)) {
      throw new UnauthorizedException('Rol invalido en token');
    }

    if (!isActiveFromToken) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const projection = 'email role isActive';
    let user: { email: string; role: UserRole; isActive: boolean } | null =
      null;

    if (role === UserRole.PATIENT) {
      user = await this.patientModel
        .findById(dbId)
        .select(projection)
        .lean()
        .exec();
    } else if (role === UserRole.DOCTOR) {
      user = await this.doctorModel
        .findById(dbId)
        .select(projection)
        .lean()
        .exec();
    } else if (role === UserRole.ADMIN) {
      user = await this.adminModel
        .findById(dbId)
        .select(projection)
        .lean()
        .exec();
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token invalido o usuario inactivo');
    }

    return {
      userId: dbId,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
