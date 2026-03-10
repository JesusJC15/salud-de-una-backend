import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { parseCookies } from '../common/utils/cookie.utils';
import { AuthMeResponseDto } from './dto/auth-me.response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('patient/register')
  @Public()
  @SkipCsrf()
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.authService.registerPatient(dto);
  }

  @Post('doctor/register')
  @Public()
  @SkipCsrf()
  registerDoctor(@Body() dto: RegisterDoctorDto) {
    return this.authService.registerDoctor(dto);
  }

  @Post('patient/login')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  async loginPatient(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.loginPatient(
      dto.email,
      dto.password,
    );
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return { user: session.user };
  }

  @Post('staff/login')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  async loginStaff(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.loginStaff(dto.email, dto.password);
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return { user: session.user };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = dto.refreshToken ?? this.getRefreshCookie(request);
    const session = await this.authService.refreshTokens(refreshToken);
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return { user: session.user };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = dto.refreshToken ?? this.getRefreshCookie(request);
    await this.authService.revokeRefreshSession(refreshToken);

    const cookieSettings = this.getCookieSettings();
    response.clearCookie(cookieSettings.accessTokenCookieName, {
      domain: cookieSettings.cookieDomain,
      path: cookieSettings.cookiePath,
    });
    response.clearCookie(cookieSettings.refreshTokenCookieName, {
      domain: cookieSettings.cookieDomain,
      path: cookieSettings.cookiePath,
    });

    return { message: 'Sesion cerrada' };
  }

  @Get('me')
  me(@Req() request: RequestContext): AuthMeResponseDto {
    return this.authService.me(request.user!);
  }

  @Post('csrf')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  issueCsrfToken(@Res({ passthrough: true }) response: Response) {
    const token = this.authService.generateCsrfToken();
    const cookieSettings = this.getCookieSettings();

    response.cookie(cookieSettings.csrfCookieName, token, {
      httpOnly: false,
      secure: cookieSettings.cookieSecure,
      sameSite: cookieSettings.cookieSameSite,
      domain: cookieSettings.cookieDomain,
      path: cookieSettings.cookiePath,
    });

    return {
      csrfToken: token,
      headerName: cookieSettings.csrfHeaderName,
    };
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const cookieSettings = this.getCookieSettings();

    response.cookie(cookieSettings.accessTokenCookieName, accessToken, {
      httpOnly: true,
      secure: cookieSettings.cookieSecure,
      sameSite: cookieSettings.cookieSameSite,
      domain: cookieSettings.cookieDomain,
      path: cookieSettings.cookiePath,
    });

    response.cookie(cookieSettings.refreshTokenCookieName, refreshToken, {
      httpOnly: true,
      secure: cookieSettings.cookieSecure,
      sameSite: cookieSettings.cookieSameSite,
      domain: cookieSettings.cookieDomain,
      path: cookieSettings.cookiePath,
    });
  }

  private getRefreshCookie(request: Request): string | undefined {
    const refreshTokenCookieName = this.configService.get<string>(
      'web.refreshTokenCookieName',
    );
    const cookies = parseCookies(request.headers.cookie);
    return refreshTokenCookieName ? cookies[refreshTokenCookieName] : undefined;
  }

  private getCookieSettings() {
    return {
      accessTokenCookieName: this.configService.get<string>(
        'web.accessTokenCookieName',
      )!,
      refreshTokenCookieName: this.configService.get<string>(
        'web.refreshTokenCookieName',
      )!,
      csrfCookieName: this.configService.get<string>('web.csrfCookieName')!,
      csrfHeaderName: this.configService.get<string>('web.csrfHeaderName')!,
      cookieDomain:
        this.configService.get<string>('web.cookieDomain') || undefined,
      cookiePath: this.configService.get<string>('web.cookiePath') ?? '/',
      cookieSameSite:
        (this.configService.get<string>('web.cookieSameSite') as
          | 'lax'
          | 'strict'
          | 'none') ?? 'lax',
      cookieSecure:
        this.configService.get<boolean>('web.cookieSecure') ?? false,
    };
  }
}
