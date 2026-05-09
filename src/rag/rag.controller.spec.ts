import { RagController } from './rag.controller';

describe('RagController', () => {
  const ragService = {
    retrieve: jest.fn(),
    answer: jest.fn(),
    captureFeedback: jest.fn(),
  };

  const req = {
    user: { userId: 'doctor-1' },
    correlationId: 'corr-1',
  };

  let controller: RagController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RagController(ragService as never);
  });

  it('delegates retrieve, answer and feedback with request context', async () => {
    await controller.retrieve({ query: 'dolor' }, req as never);
    await controller.answer(
      { query: 'dolor', mode: 'STAFF' } as never,
      req as never,
    );
    await controller.feedback(
      { traceId: 'trace-1', useful: true, grounded: true },
      req as never,
    );

    expect(ragService.retrieve).toHaveBeenCalledWith(
      { query: 'dolor' },
      req.user,
      'corr-1',
    );
    expect(ragService.answer).toHaveBeenCalledWith(
      { query: 'dolor', mode: 'STAFF' },
      req.user,
      'corr-1',
    );
    expect(ragService.captureFeedback).toHaveBeenCalledWith(
      { traceId: 'trace-1', useful: true, grounded: true },
      req.user,
    );
  });
});
