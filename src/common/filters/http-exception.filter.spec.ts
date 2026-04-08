import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  function createHost(requestOverrides?: Partial<any>) {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      method: 'GET',
      originalUrl: '/test',
      headers: {},
      ...requestOverrides,
    };
    const host: ArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost;

    return { host, response };
  }

  it('should handle HttpException with message array', () => {
    const { host, response } = createHost({ correlationId: 'cid-1' });
    const exception = new BadRequestException(['field required']);

    filter.catch(exception, host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'cid-1',
    );
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['field required'],
        path: '/test',
      }),
    );
  });

  it('should handle non-HttpException with 500', () => {
    const { host, response } = createHost();
    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      }),
    );
  });

  it('should include custom payload fields from HttpException response', () => {
    const { host, response } = createHost({ correlationId: 'cid-2' });
    const exception = new BadRequestException({
      message: 'invalid payload',
      errorCode: 'CUSTOM_CODE',
      detail: 'extra-value',
    });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'invalid payload',
        errorCode: 'CUSTOM_CODE',
        detail: 'extra-value',
      }),
    );
  });
});
