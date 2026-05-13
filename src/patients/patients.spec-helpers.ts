import { getModelToken } from '@nestjs/mongoose';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { Followup } from '../followups/schemas/followup.schema';
import { TriageSession } from '../triage/schemas/triage-session.schema';

export const EMPTY_TIMELINE_RESULT = {
  items: [],
  nextCursor: null,
};

export function createResolvedLeanQuery(result: unknown) {
  return {
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(result),
    }),
  };
}

export function createSelectLeanQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

export function createTimelineModelProviders(models: {
  consultationModel: unknown;
  triageSessionModel: unknown;
  followupModel: unknown;
}) {
  return [
    {
      provide: getModelToken(Consultation.name),
      useValue: models.consultationModel,
    },
    {
      provide: getModelToken(TriageSession.name),
      useValue: models.triageSessionModel,
    },
    { provide: getModelToken(Followup.name), useValue: models.followupModel },
  ];
}
