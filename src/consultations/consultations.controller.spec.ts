import { ConsultationsController } from './consultations.controller';

const mockService = {
  getQueue: jest.fn(),
  getPatientHistory: jest.fn(),
  getDoctorHistory: jest.fn(),
  getById: jest.fn(),
  assign: jest.fn(),
  generateSummary: jest.fn(),
  close: jest.fn(),
  rateConsultation: jest.fn(),
  getMessages: jest.fn(),
};

function makeReq(userId = 'user-1') {
  return { user: { userId } } as never;
}

describe('ConsultationsController', () => {
  let controller: ConsultationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ConsultationsController(mockService as never);
  });

  it('getQueue delegates to service', () => {
    mockService.getQueue.mockReturnValue({ items: [] });
    expect(controller.getQueue()).toEqual({ items: [] });
    expect(mockService.getQueue).toHaveBeenCalled();
  });

  describe('getPatientHistory', () => {
    it('passes parsed query params when provided', () => {
      controller.getPatientHistory('10', '2', 'CLOSED', makeReq('p1'));
      expect(mockService.getPatientHistory).toHaveBeenCalledWith('p1', {
        limit: 10,
        page: 2,
        status: 'CLOSED',
      });
    });

    it('passes undefined when query params are absent', () => {
      controller.getPatientHistory(
        undefined as never,
        undefined as never,
        undefined as never,
        makeReq('p1'),
      );
      expect(mockService.getPatientHistory).toHaveBeenCalledWith('p1', {
        limit: undefined,
        page: undefined,
        status: undefined,
      });
    });

    it('passes undefined status when empty string', () => {
      controller.getPatientHistory('5', '1', '', makeReq('p1'));
      expect(mockService.getPatientHistory).toHaveBeenCalledWith('p1', {
        limit: 5,
        page: 1,
        status: undefined,
      });
    });
  });

  describe('getDoctorHistory', () => {
    it('passes parsed query params when provided', () => {
      controller.getDoctorHistory('20', '3', 'IN_ATTENTION', makeReq('d1'));
      expect(mockService.getDoctorHistory).toHaveBeenCalledWith('d1', {
        limit: 20,
        page: 3,
        status: 'IN_ATTENTION',
      });
    });

    it('passes undefined when query params are absent', () => {
      controller.getDoctorHistory(
        undefined as never,
        undefined as never,
        undefined as never,
        makeReq('d1'),
      );
      expect(mockService.getDoctorHistory).toHaveBeenCalledWith('d1', {
        limit: undefined,
        page: undefined,
        status: undefined,
      });
    });
  });

  it('getById delegates with id and userId', () => {
    controller.getById('c1', makeReq('d1'));
    expect(mockService.getById).toHaveBeenCalledWith('c1', 'd1');
  });

  it('assign delegates with id and userId', () => {
    controller.assign('c1', makeReq('d1'));
    expect(mockService.assign).toHaveBeenCalledWith('c1', 'd1');
  });

  it('generateSummary delegates with id and userId', () => {
    controller.generateSummary('c1', makeReq('d1'));
    expect(mockService.generateSummary).toHaveBeenCalledWith('c1', 'd1');
  });

  it('close delegates with id and userId', () => {
    controller.close('c1', makeReq('d1'));
    expect(mockService.close).toHaveBeenCalledWith('c1', 'd1');
  });

  it('rateConsultation delegates with id, userId, and dto', () => {
    const dto = { rating: 5 };
    controller.rateConsultation('c1', dto as never, makeReq('p1'));
    expect(mockService.rateConsultation).toHaveBeenCalledWith('c1', 'p1', dto);
  });

  describe('getMessages', () => {
    it('passes parsed limit when provided', () => {
      controller.getMessages('c1', '30', makeReq('d1'));
      expect(mockService.getMessages).toHaveBeenCalledWith('c1', 'd1', 30);
    });

    it('uses default limit 50 when absent', () => {
      controller.getMessages('c1', undefined as never, makeReq('d1'));
      expect(mockService.getMessages).toHaveBeenCalledWith('c1', 'd1', 50);
    });

    it('clamps limit to 100', () => {
      controller.getMessages('c1', '999', makeReq('d1'));
      expect(mockService.getMessages).toHaveBeenCalledWith('c1', 'd1', 100);
    });

    it('falls back to 50 when limit is non-numeric', () => {
      controller.getMessages('c1', 'abc', makeReq('d1'));
      expect(mockService.getMessages).toHaveBeenCalledWith('c1', 'd1', 50);
    });
  });
});
