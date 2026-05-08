export const TRIAGE_QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'NUMERIC_SCALE',
] as const;

export type TriageQuestionType = (typeof TRIAGE_QUESTION_TYPES)[number];
