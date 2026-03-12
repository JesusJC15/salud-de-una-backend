import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AuthMeResponseDto } from './dto/auth-me.response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('patient/register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.authService.registerPatient(dto);
  }

  @Post('doctor/register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerDoctor(@Body() dto: RegisterDoctorDto) {
    return this.authService.registerDoctor(dto);
  }

  @Post('patient/login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginPatient(@Body() dto: LoginDto) {
    const session = await this.authService.loginPatient(
      dto.email,
      dto.password,
    );
    return this.buildAuthResponse(session);
  }

  @Post('staff/login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginStaff(@Body() dto: LoginDto) {
    const session = await this.authService.loginStaff(dto.email, dto.password);
    return this.buildAuthResponse(session);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const session = await this.authService.refreshTokens(dto.refreshToken);
    return this.buildAuthResponse(session);
  }

  @Post('logout')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    await this.authService.revokeRefreshSession(dto.refreshToken);
    return { message: 'Sesion cerrada' };
  }

  @Get('me')
  me(@Req() request: RequestContext): AuthMeResponseDto {
    return this.authService.me(request.user!);
  }

  private buildAuthResponse(session: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      role: string;
    };
  }) {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    };
  }
}
