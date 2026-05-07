import type { RequestContext } from '../common/interfaces/request-context.interface';
import { buildRequestContext } from '../common/testing/request-test-helpers';
import { UserRole } from '../common/enums/user-role.enum';
import { FollowupsController } from './followups.controller';

describe('FollowupsController', () => {
  const service = {
    getMine: jest.fn(),
    getById: jest.fn(),
    submit: jest.fn(),
  };

  let controller: FollowupsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FollowupsController(service as never);
  });

  function makeReq(
    userId = 'patient-1',
    role: UserRole = UserRole.PATIENT,
  ): RequestContext {
    return buildRequestContext({
      user: {
        userId,
        role,
        email: `${userId}@test.com`,
      },
    });
  }

  it('delegates getMine with req.user and optional status', () => {
    const req = makeReq();

    void controller.getMine(req, 'PENDING');

    expect(service.getMine).toHaveBeenCalledWith(req.user, 'PENDING');
  });

  it('delegates getMine with undefined status when omitted', () => {
    const req = makeReq();

    void controller.getMine(req);

    expect(service.getMine).toHaveBeenCalledWith(req.user, undefined);
  });

  it('delegates getById with followup id and req.user', () => {
    const req = makeReq('doctor-1', UserRole.DOCTOR);

    void controller.getById(req, 'followup-1');

    expect(service.getById).toHaveBeenCalledWith('followup-1', req.user);
  });

  it('delegates submit with req.user and dto', () => {
    const req = makeReq();
    const dto = {
      followupId: 'followup-1',
      currentSymptomSeverity: 3,
      change: 'BETTER',
      medicationTaken: true,
    };

    void controller.submit(req, dto as never);

    expect(service.submit).toHaveBeenCalledWith(req.user, dto);
  });
});
