export type AuthSessionResponseBody = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    isActive?: boolean;
  };
};

export type HttpErrorResponseBody = {
  statusCode: number;
  message: string | string[];
  errorCode?: string;
  existingSessionId?: string;
};

export type AdminDoctorsListResponseBody = {
  summary: {
    total: number;
    pending: number;
    verified: number;
    rejected: number;
  };
  items: Array<{
    id: string;
    doctorStatus: string;
    latestVerification: {
      rethusState: string;
    } | null;
  }>;
};

export type AdminUsersListResponseBody = {
  items: Array<{ id: string }>;
};

export type AdminUserDetailResponseBody = {
  id: string;
  role: string;
};

export type AdminUserActiveResponseBody = {
  isActive: boolean;
};

export type NotificationsListResponseBody = {
  unreadCount: number;
  items: Array<{
    id: string;
    type: string;
    read: boolean;
  }>;
};

export type MarkNotificationReadResponseBody = {
  read: boolean;
};

export type BusinessDashboardResponseBody = {
  kpis: {
    totalPatients: number;
    totalDoctors: number;
    verifiedDoctors: number;
    pendingDoctors: number;
  };
  doctorStatusBreakdown: {
    verified: number;
    pending: number;
    rejected: number;
  };
  operationalSignals: {
    unreadNotifications: number;
    verificationCoverage: number;
  };
};

export type TechnicalDashboardResponseBody = {
  sampleSize: number;
  p95LatencyMs: number;
  errorRate: number;
  source: string;
  degraded: boolean;
};

export type ReadinessResponseBody = {
  status: 'ready' | 'not_ready';
  checks: {
    database: { status: 'up' | 'down' };
    redis: { status: 'up' | 'down' | 'disabled'; degraded: boolean };
    ai: { status: 'up' | 'degraded' | 'disabled'; degraded: boolean };
  };
};

export type AiHealthCheckResponseBody = {
  provider: string;
  model: string;
  status: 'up' | 'down' | 'disabled';
  degraded: boolean;
  requestId: string;
};

export type CreateTriageSessionResponseBody = {
  sessionId: string;
  specialty: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  remainingQuestions: number;
  progressPercent: number;
  nextQuestionId: string | null;
  isComplete: boolean;
  questions: Array<{
    questionId: string;
    questionText: string;
  }>;
};

export type SaveTriageAnswersResponseBody = {
  sessionId: string;
  answersCount: number;
  isComplete: boolean;
  totalQuestions: number;
  answeredCount: number;
  remainingQuestions: number;
  progressPercent: number;
  nextQuestionId: string | null;
};

export type AnalyzeTriageSessionResponseBody = {
  sessionId?: string;
  priority: string;
  redFlags: Array<{ code?: string }>;
  message?: string;
  highPriorityAlert?: boolean;
  analysisMode?: 'AI_ASSISTED' | 'RULE_BASED';
  noticeCode?:
    | 'IA_TEMPORARILY_UNAVAILABLE_RULE_BASED_FALLBACK'
    | 'IA_NOT_IMPLEMENTED_RULE_BASED_FALLBACK';
};

export type ActiveTriageSessionsResponseBody = {
  items: Array<{
    id: string;
    specialty: string;
    status: string;
    currentStep: number;
    totalSteps: number;
    currentQuestionId: string | null;
    isComplete: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
};

export type TriageSessionDetailResponseBody = {
  id: string;
  sessionId: string;
  specialty: string;
  status: string;
  isComplete: boolean;
  currentQuestionId: string | null;
  currentStep: number;
  totalSteps: number;
  totalQuestions: number;
  nextQuestionId: string | null;
  questions: Array<{
    id: string;
    questionId: string;
    title: string;
    questionText: string;
    description?: string;
    type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'NUMERIC_SCALE';
    options?: Array<{
      id: string;
      label: string;
      description?: string;
    }>;
    minValue?: number;
    maxValue?: number;
    step?: number;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type CancelTriageSessionResponseBody = {
  sessionId: string;
  specialty: string;
  status: string;
  canceledAt: string;
  message: string;
};
