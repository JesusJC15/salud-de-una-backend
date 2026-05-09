export const KNOWLEDGE_SOURCE_TYPES = [
  'GUIDELINE',
  'REGULATION',
  'PROTOCOL',
  'FAQ',
  'LITERATURE',
  'MEDICATION',
  'TRIAGE',
  'ROUTE',
] as const;

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_SOURCE_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

export const KNOWLEDGE_DOCUMENT_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'FAILED',
] as const;
export type KnowledgeDocumentStatus =
  (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

export const KNOWLEDGE_REVIEW_STATUSES = [
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type KnowledgeReviewStatus = (typeof KNOWLEDGE_REVIEW_STATUSES)[number];

export const KNOWLEDGE_JOB_TYPES = [
  'INGESTION',
  'REPROCESS',
  'SYNC',
  'EVALUATION',
] as const;
export type KnowledgeJobType = (typeof KNOWLEDGE_JOB_TYPES)[number];

export const KNOWLEDGE_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;
export type KnowledgeJobStatus = (typeof KNOWLEDGE_JOB_STATUSES)[number];

export const KNOWLEDGE_AUDIENCES = ['STAFF', 'PATIENT', 'BOTH'] as const;
export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];

export const KNOWLEDGE_USE_CASES = [
  'TRIAGE',
  'CLINICAL_SUMMARY',
  'PATIENT_EDUCATION',
  'MEDICATION_SAFETY',
  'URGENT_CARE',
] as const;
export type KnowledgeUseCase = (typeof KNOWLEDGE_USE_CASES)[number];

export const KNOWLEDGE_BUCKET_NAME = 'knowledge-files';
