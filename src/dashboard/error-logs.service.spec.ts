import { ErrorLogsService } from './error-logs.service';

describe('ErrorLogsService', () => {
  it('append should add newest entries first', () => {
    const service = new ErrorLogsService();

    service.append({
      statusCode: 500,
      method: 'GET',
      url: '/v1/a',
      errorMessage: 'first',
    });
    service.append({
      statusCode: 404,
      method: 'POST',
      url: '/v1/b',
      errorMessage: 'second',
    });

    expect(service.getRecent(2).map((item) => item.errorMessage)).toEqual([
      'second',
      'first',
    ]);
  });

  it('append should keep only the latest 50 entries and getRecent should clamp the limit', () => {
    const service = new ErrorLogsService();

    for (let index = 0; index < 55; index += 1) {
      service.append({
        statusCode: 500,
        method: 'GET',
        url: `/v1/${index}`,
        errorMessage: `error-${index}`,
      });
    }

    const recent = service.getRecent(100);

    expect(recent).toHaveLength(50);
    expect(recent[0].errorMessage).toBe('error-54');
    expect(recent.at(-1)?.errorMessage).toBe('error-5');
  });

  it('clear should empty the buffer', () => {
    const service = new ErrorLogsService();

    service.append({
      statusCode: 500,
      method: 'GET',
      url: '/v1/test',
      errorMessage: 'boom',
    });
    service.clear();

    expect(service.getRecent()).toEqual([]);
  });
});
