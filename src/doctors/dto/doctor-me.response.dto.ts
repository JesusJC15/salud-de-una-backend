export interface DoctorMeVerificationResponseDto {
  programType: string;
  titleObtainingOrigin: string;
  professionOccupation: string;
  startDate: Date;
  rethusState: string;
  administrativeAct: string;
  reportingEntity: string;
  checkedAt: Date;
  checkedBy: string;
  evidenceUrl?: string;
  notes?: string;
}

export interface DoctorMeResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  specialty: string;
  doctorStatus: string;
  availabilityStatus: string;
  verification: DoctorMeVerificationResponseDto | null;
}
