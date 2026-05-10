import { ErrorLogsService } from './error-logs.service';

describe('ErrorLogsService', () => {
  function createService() {
    const model = {
      create: jest.fn().mockResolvedValue(undefined),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            lean: jest.fn(() => ({
              exec: jest.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
      deleteMany: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(undefined),
      })),
    };

    return new ErrorLogsService(model as never);
  }

  it('append should add newest entries first', async () => {
    const service = createService();

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

    expect((await service.getRecent(2)).map((item) => item.errorMessage)).toEqual([
      'second',
      'first',
    ]);
  });

  it('append should keep only the latest 50 entries and getRecent should clamp the limit', async () => {
    const service = createService();

    for (let index = 0; index < 55; index += 1) {
      service.append({
        statusCode: 500,
        method: 'GET',
        url: `/v1/${index}`,
        errorMessage: `error-${index}`,
      });
    }

    const recent = await service.getRecent(100);

    expect(recent).toHaveLength(50);
    expect(recent[0].errorMessage).toBe('error-54');
    expect(recent.at(-1)?.errorMessage).toBe('error-5');
  });

  it('clear should empty the buffer', async () => {
    const service = createService();

    service.append({
      statusCode: 500,
      method: 'GET',
      url: '/v1/test',
      errorMessage: 'boom',
    });
    await service.clear();

    await expect(service.getRecent()).resolves.toEqual([]);
  });
});
