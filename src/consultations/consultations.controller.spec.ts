import type { RequestContext } from '../common/interfaces/request-context.interface';
import { buildRequestContext } from '../common/testing/request-test-helpers';
import { UserRole } from '../common/enums/user-role.enum';
import { ListConsultationsHistoryDto } from './dto/list-consultations-history.dto';
import { SummaryFeedbackDto } from './dto/summary-feedback.dto';
import { ConsultationsController } from './consultations.controller';

const mockService = {
  getQueue: jest.fn(),
  getPatientHistory: jest.fn(),
  getDoctorHistory: jest.fn(),
  getById: jest.fn(),
  assign: jest.fn(),
  generateSummary: jest.fn(),
  submitSummaryFeedback: jest.fn(),
  close: jest.fn(),
  rate: jest.fn(),
  getMessages: jest.fn(),
};

function makeReq(
  userId = 'user-1',
  role: UserRole = UserRole.PATIENT,
  correlationId = 'corr-1',
): RequestContext {
  return buildRequestContext({
    user: {
      userId,
      role,
      email: `${userId}@test.com`,
    },
    correlationId,
  });
}

describe('ConsultationsController', () => {
  let controller: ConsultationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ConsultationsController(mockService as never);
  });

  it('getQueue delegates to service', () => {
    const req = makeReq('d1', UserRole.DOCTOR);
    mockService.getQueue.mockReturnValue({ items: [] });

    expect(controller.getQueue(req)).toEqual({ items: [] });
    expect(mockService.getQueue).toHaveBeenCalledWith(req.user);
  });

  describe('getPatientHistory', () => {
    it('delegates req.user and query dto as received', () => {
      const req = makeReq('p1', UserRole.PATIENT);
      const query: ListConsultationsHistoryDto = {
        limit: 10,
        page: 2,
        status: 'CLOSED',
      };

      void controller.getPatientHistory(req, query);

      expect(mockService.getPatientHistory).toHaveBeenCalledWith(
        req.user,
        query,
      );
    });

    it('passes an empty query object when no filters are provided', () => {
      const req = makeReq('p1', UserRole.PATIENT);
      const query: ListConsultationsHistoryDto = {};

      void controller.getPatientHistory(req, query);

      expect(mockService.getPatientHistory).toHaveBeenCalledWith(
        req.user,
        query,
      );
    });
  });

  describe('getDoctorHistory', () => {
    it('delegates req.user and query dto as received', () => {
      const req = makeReq('d1', UserRole.DOCTOR);
      const query: ListConsultationsHistoryDto = {
        limit: 20,
        page: 3,
        status: 'IN_ATTENTION',
      };

      void controller.getDoctorHistory(req, query);

      expect(mockService.getDoctorHistory).toHaveBeenCalledWith(
        req.user,
        query,
      );
    });
  });

  it('getById delegates with consultationId and req.user', () => {
    const req = makeReq('d1', UserRole.DOCTOR);

    void controller.getById(req, 'c1');

    expect(mockService.getById).toHaveBeenCalledWith('c1', req.user);
  });

  it('assign delegates with consultationId and req.user', () => {
    const req = makeReq('d1', UserRole.DOCTOR);

    void controller.assign(req, 'c1');

    expect(mockService.assign).toHaveBeenCalledWith('c1', req.user);
  });

  it('generateSummary delegates with consultationId and req.user', () => {
    const req = makeReq('d1', UserRole.DOCTOR);

    void controller.generateSummary(req, 'c1');

    expect(mockService.generateSummary).toHaveBeenCalledWith('c1', req.user);
  });

  it('submitSummaryFeedback delegates with consultationId, req.user and dto', () => {
    const req = makeReq('d1', UserRole.DOCTOR);
    const dto: SummaryFeedbackDto = { value: 'USEFUL', comment: 'ok' };

    void controller.submitSummaryFeedback(req, 'c1', dto);

    expect(mockService.submitSummaryFeedback).toHaveBeenCalledWith(
      'c1',
      req.user,
      dto,
    );
  });

  it('close delegates with consultationId, req.user, dto and correlationId', () => {
    const req = makeReq('d1', UserRole.DOCTOR, 'corr-close');
    const dto = {
      baselineSymptomSeverity: 3,
      redFlagsConfirmed: true,
    };

    void controller.close(req, 'c1', dto);

    expect(mockService.close).toHaveBeenCalledWith(
      'c1',
      req.user,
      dto,
      'corr-close',
    );
  });

  it('rate delegates with consultationId, req.user and dto', () => {
    const req = makeReq('p1', UserRole.PATIENT);
    const dto = { rating: 5, ratingComment: 'Muy buena' };

    void controller.rate(req, 'c1', dto);

    expect(mockService.rate).toHaveBeenCalledWith('c1', req.user, dto);
  });

  describe('getMessages', () => {
    it('passes through the provided limit string converted to number by the controller', () => {
      const req = makeReq('d1', UserRole.DOCTOR);

      void controller.getMessages(req, 'c1', '30');

      expect(mockService.getMessages).toHaveBeenCalledWith('c1', req.user, 30);
    });

    it('passes undefined when the limit query is absent', () => {
      const req = makeReq('d1', UserRole.DOCTOR);

      void controller.getMessages(req, 'c1');

      expect(mockService.getMessages).toHaveBeenCalledWith(
        'c1',
        req.user,
        undefined,
      );
    });

    it('passes NaN when the limit query is non-numeric', () => {
      const req = makeReq('d1', UserRole.DOCTOR);

      void controller.getMessages(req, 'c1', 'abc');

      expect(mockService.getMessages).toHaveBeenCalledWith(
        'c1',
        req.user,
        Number.NaN,
      );
    });
  });
});
