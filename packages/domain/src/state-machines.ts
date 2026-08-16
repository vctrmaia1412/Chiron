import { DomainError, invalidTransition } from './errors';

// ---------------------------------------------------------------- agenda
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_service'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'rescheduled';

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show', 'rescheduled'],
  confirmed: ['checked_in', 'cancelled', 'no_show', 'rescheduled'],
  checked_in: ['in_service', 'cancelled', 'completed'],
  in_service: ['completed', 'cancelled', 'checked_in'],
  completed: [],
  no_show: ['rescheduled'],
  cancelled: [],
  rescheduled: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransitionAppointment(from, to)) throw invalidTransition('agendamento', from, to);
}

/** Estados em que o agendamento ainda ocupa o horário do profissional. */
export const APPOINTMENT_BLOCKING_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
];

// ----------------------------------------------------------- atendimento
export type EncounterStatus =
  | 'arrived'
  | 'triaged'
  | 'in_progress'
  | 'on_hold'
  | 'finished'
  | 'cancelled'
  | 'entered_in_error';

export const ENCOUNTER_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  arrived: ['triaged', 'in_progress', 'cancelled'],
  triaged: ['in_progress', 'cancelled'],
  in_progress: ['on_hold', 'finished', 'cancelled'],
  on_hold: ['in_progress', 'finished', 'cancelled'],
  // reabertura e marcação de erro são possíveis a partir de finalizado
  finished: ['in_progress', 'entered_in_error'],
  cancelled: [],
  entered_in_error: [],
};

export function canTransitionEncounter(from: EncounterStatus, to: EncounterStatus): boolean {
  return ENCOUNTER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertEncounterTransition(from: EncounterStatus, to: EncounterStatus): void {
  if (!canTransitionEncounter(from, to)) throw invalidTransition('atendimento', from, to);
}

/** Estados em que o atendimento ainda aceita escrita direta nas notas. */
export const ENCOUNTER_OPEN_STATUSES: EncounterStatus[] = ['arrived', 'triaged', 'in_progress', 'on_hold'];

export function isEncounterOpen(status: EncounterStatus): boolean {
  return ENCOUNTER_OPEN_STATUSES.includes(status);
}

export function assertEncounterWritable(status: EncounterStatus): void {
  if (!isEncounterOpen(status)) {
    throw new DomainError(
      'ENCOUNTER_LOCKED',
      'Atendimento finalizado. Use adendo para registrar correções.',
      { status },
    );
  }
}

/** Status do agendamento derivado do status do atendimento. */
export function appointmentStatusForEncounter(
  encounterStatus: EncounterStatus,
): AppointmentStatus | null {
  switch (encounterStatus) {
    case 'in_progress':
    case 'on_hold':
      return 'in_service';
    case 'finished':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

// -------------------------------------------------------- nota clínica
export type NoteStatus = 'draft' | 'final' | 'amended' | 'entered_in_error';

export const NOTE_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft: ['draft', 'final', 'entered_in_error'],
  final: ['amended', 'entered_in_error'],
  amended: [],
  entered_in_error: [],
};

export function canTransitionNote(from: NoteStatus, to: NoteStatus): boolean {
  return NOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------- prescrição
export type PrescriptionStatus = 'draft' | 'signed' | 'cancelled' | 'entered_in_error';

export const PRESCRIPTION_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  draft: ['draft', 'signed', 'cancelled', 'entered_in_error'],
  signed: ['cancelled', 'entered_in_error'],
  cancelled: [],
  entered_in_error: [],
};

export function assertPrescriptionTransition(from: PrescriptionStatus, to: PrescriptionStatus): void {
  if (!(PRESCRIPTION_TRANSITIONS[from]?.includes(to) ?? false)) {
    throw invalidTransition('receita', from, to);
  }
}

// -------------------------------------------------------- pedido exame
export type ExamOrderItemStatus =
  | 'requested'
  | 'collected'
  | 'sent'
  | 'in_progress'
  | 'resulted'
  | 'reviewed'
  | 'cancelled';

export const EXAM_ITEM_TRANSITIONS: Record<ExamOrderItemStatus, ExamOrderItemStatus[]> = {
  requested: ['collected', 'sent', 'resulted', 'cancelled'],
  collected: ['sent', 'in_progress', 'resulted', 'cancelled'],
  sent: ['in_progress', 'resulted', 'cancelled'],
  in_progress: ['resulted', 'cancelled'],
  resulted: ['reviewed', 'resulted'],
  reviewed: ['resulted'],
  cancelled: [],
};

export function assertExamItemTransition(from: ExamOrderItemStatus, to: ExamOrderItemStatus): void {
  if (!(EXAM_ITEM_TRANSITIONS[from]?.includes(to) ?? false)) {
    throw invalidTransition('item de exame', from, to);
  }
}

/** Status agregado do pedido a partir dos itens. */
export function aggregateExamOrderStatus(
  itemStatuses: readonly ExamOrderItemStatus[],
): 'ordered' | 'partially_resulted' | 'resulted' | 'reviewed' | 'cancelled' {
  const active = itemStatuses.filter((s) => s !== 'cancelled');
  if (active.length === 0) return 'cancelled';
  if (active.every((s) => s === 'reviewed')) return 'reviewed';
  if (active.every((s) => s === 'resulted' || s === 'reviewed')) return 'resulted';
  if (active.some((s) => s === 'resulted' || s === 'reviewed')) return 'partially_resulted';
  return 'ordered';
}
