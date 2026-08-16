export const DEFAULT_ORGANIZATION_ID = "org-demo";

type EntityWithOrganization = { organizationId?: string };
type PatientLike = { id: string; organizationId?: string };
type AppointmentLike = { id: string; patientId: string; organizationId?: string };
type ClinicalRecordLike = { id: string; patientId: string; appointmentId?: string; organizationId?: string };

type PermissionResult<T> = {
  ok: boolean;
  message: string;
  value?: T;
};

export function assertPatientBelongsToOrganization(
  patientId: string | undefined,
  patients: PatientLike[],
  organizationId: string,
): PermissionResult<PatientLike> {
  if (!patientId) return { ok: false, message: "Paciente obrigatório." };

  const patient = patients.find((entry) => entry.id === patientId);
  if (!patient) return { ok: false, message: "Paciente não encontrado." };

  if (patient.organizationId && patient.organizationId !== organizationId) {
    return { ok: false, message: "Paciente não pertence à organização atual." };
  }

  return { ok: true, message: "Paciente validado.", value: patient };
}

export function assertAppointmentBelongsToOrganization(
  patientId: string | undefined,
  appointmentId: string | undefined,
  appointments: AppointmentLike[],
  organizationId: string,
): PermissionResult<AppointmentLike> {
  if (!appointmentId) return { ok: false, message: "Atendimento obrigatório." };

  const appointment = appointments.find((entry) => entry.id === appointmentId && entry.patientId === patientId);
  if (!appointment) {
    return { ok: false, message: "Atendimento não encontrado para esse paciente." };
  }

  if (appointment.organizationId && appointment.organizationId !== organizationId) {
    return { ok: false, message: "Atendimento não pertence à organização atual." };
  }

  return { ok: true, message: "Atendimento validado.", value: appointment };
}

export function assertClinicalRecordBelongsToAppointment(
  patientId: string | undefined,
  appointmentId: string | undefined,
  record: ClinicalRecordLike | undefined,
  organizationId: string,
): PermissionResult<ClinicalRecordLike> {
  if (!record) return { ok: false, message: "Registro clínico não encontrado." };

  if (!patientId || record.patientId !== patientId) {
    return { ok: false, message: "Registro clínico associado a outro paciente." };
  }

  if (appointmentId && record.appointmentId && record.appointmentId !== appointmentId) {
    return { ok: false, message: "Registro clínico associado a outro atendimento." };
  }

  if (record.organizationId && record.organizationId !== organizationId) {
    return { ok: false, message: "Registro clínico fora da organização atual." };
  }

  return { ok: true, message: "Registro clínico validado.", value: record };
}

export function buildDerivedTimeline<T extends EntityWithOrganization & { patientId?: string; appointmentId?: string; id: string; date?: string; createdAt?: string; title?: string; detail?: string; doctor?: string; tag?: string; type?: string; status?: string; name?: string; }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt ?? a.date ?? "1970-01-01").getTime();
    const bTime = new Date(b.createdAt ?? b.date ?? "1970-01-01").getTime();
    return bTime - aTime;
  });
}
