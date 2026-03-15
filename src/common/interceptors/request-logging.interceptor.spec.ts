import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DashboardService } from '../../dashboard/dashboard.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  let interceptor: RequestLoggingInterceptor;
  let dashboardService: { record: jest.Mock };
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    dashboardService = { record: jest.fn() };
    interceptor = new RequestLoggingInterceptor(
      dashboardService as unknown as DashboardService,
    );
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function createContext(overrides?: Partial<any>): ExecutionContext {
    const request = {
      headers: {},
      method: 'GET',
      originalUrl: '/test',
      user: { userId: 'u1', role: 'PATIENT' },
    };
    const response = {
      setHeader: jest.fn(),
      statusCode: 200,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({ ...request, ...overrides?.request }),
        getResponse: () => ({ ...response, ...overrides?.response }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should log success and record metrics', (done) => {
    const context = createContext();
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(dashboardService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 200,
          }),
        );
        expect(logSpy).toHaveBeenCalled();
        done();
      },
      error: done,
    });
  });

  it('should log success with anonymous user when missing', (done) => {
    const context = createContext({
      request: { user: undefined },
    });
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(dashboardService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 200,
          }),
        );
        done();
      },
      error: done,
    });
  });

  it('should log error and record metrics', (done) => {
    const context = createContext({
      response: { statusCode: 201 },
    });
    const next: CallHandler = {
      handle: () =>
        throwError(() => new HttpException('Boom', HttpStatus.BAD_REQUEST)),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => done(new Error('expected error')),
      error: () => {
        expect(dashboardService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 400,
          }),
        );
        expect(errorSpy).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should reuse correlation id from headers and handle non-HttpException errors', (done) => {
    const context = createContext({
      request: { headers: { 'x-correlation-id': 'cid-123' } },
    });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => done(new Error('expected error')),
      error: () => {
        expect(dashboardService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500,
          }),
        );
        expect(errorSpy).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should handle errors that are not Error instances', (done) => {
    const context = createContext();
    const next: CallHandler = {
      handle: () => throwError(() => 'boom'),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => done(new Error('expected error')),
      error: () => {
        expect(dashboardService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500,
          }),
        );
        done();
      },
    });
  });
});
