import { DoctorStatus } from '../../../src/common/enums/doctor-status.enum';
import { RethusState } from '../../../src/common/enums/rethus-state.enum';

type PatientRegistrationOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE' | 'OTHER';
}>;

type DoctorRegistrationOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  specialty: 'GENERAL_MEDICINE' | 'ODONTOLOGY';
  personalId: string;
  phoneNumber: string;
}>;

type AdminSeedOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}>;

let uniqueCounter = 0;

export function uniqueValue(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}`;
}

export function buildStrongPassword(): string {
  return `Aa1!${uniqueValue('pwd')}`;
}

export function buildPatientRegistrationDto(
  overrides: PatientRegistrationOverrides = {},
) {
  const unique = uniqueValue('patient');

  return {
    firstName: 'Paciente',
    lastName: 'Prueba',
    email: `${unique}@example.com`,
    password: buildStrongPassword(),
    ...overrides,
  };
}

export function buildDoctorRegistrationDto(
  overrides: DoctorRegistrationOverrides = {},
) {
  const unique = uniqueValue('doctor');

  return {
    firstName: 'Laura',
    lastName: 'Medina',
    email: `${unique}@example.com`,
    password: buildStrongPassword(),
    specialty: 'GENERAL_MEDICINE' as const,
    personalId: `CC-${uniqueValue('pid')}`,
    phoneNumber: '3001234567',
    ...overrides,
  };
}

export function buildAdminSeed(overrides: AdminSeedOverrides = {}) {
  return {
    firstName: 'System',
    lastName: 'Admin',
    email: `${uniqueValue('admin')}@example.com`,
    password: 'AdminP@ss1',
    ...overrides,
  };
}

export function buildRethusVerifyPayload(
  doctorStatus: DoctorStatus = DoctorStatus.VERIFIED,
) {
  return {
    programType: 'UNIVERSITY',
    titleObtainingOrigin: 'LOCAL',
    professionOccupation: 'MEDICO GENERAL',
    startDate: '2024-01-15',
    rethusState:
      doctorStatus === DoctorStatus.REJECTED
        ? RethusState.EXPIRED
        : RethusState.VALID,
    administrativeAct: 'ACT-2026-001',
    reportingEntity: 'MINISTERIO DE SALUD',
    notes: 'Validado por pruebas e2e',
  };
}

export function buildRethusDecisionDto() {
  return {
    action: 'APPROVE',
    notes: 'Aprobado por endpoint canonico',
  };
}

export function buildRethusResubmissionDto() {
  return {
    evidenceUrl: 'https://example.com/new-rethus.pdf',
    notes: 'Reenvio de soportes',
  };
}

export function buildGeneralMedicineAnswers() {
  return [
    { questionId: 'MG-Q1', answerValue: 'dolor de cabeza' },
    { questionId: 'MG-Q2', answerValue: '2 dias' },
    { questionId: 'MG-Q3', answerValue: 5 },
    { questionId: 'MG-Q4', answerValue: 'no' },
    { questionId: 'MG-Q5', answerValue: 'no' },
  ];
}

export function buildPartialGeneralMedicineAnswers() {
  return [{ questionId: 'MG-Q1', answerValue: 'dolor de cabeza' }];
}

export function buildHighPriorityGeneralMedicineAnswers() {
  return [
    {
      questionId: 'MG-Q1',
      answerValue: 'dolor toracico con falta de aire desde hoy',
    },
    { questionId: 'MG-Q2', answerValue: '1 dia' },
    { questionId: 'MG-Q3', answerValue: 7 },
    { questionId: 'MG-Q4', answerValue: 'no' },
    { questionId: 'MG-Q5', answerValue: 'dificultad para respirar' },
  ];
}

export function buildOdontologyAnswers() {
  return [
    { questionId: 'OD-Q1', answerValue: 'muela superior derecha' },
    { questionId: 'OD-Q2', answerValue: '3 dias' },
    { questionId: 'OD-Q3', answerValue: 8 },
    { questionId: 'OD-Q4', answerValue: 'si' },
    { questionId: 'OD-Q5', answerValue: 'si' },
  ];
}
