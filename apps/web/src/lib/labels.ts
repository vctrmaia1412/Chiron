/**
 * Rótulos em português para os códigos que trafegam na API. Ficam aqui, em um
 * lugar só, para que a mesma palavra apareça igual em toda a interface.
 */

export const APPOINTMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: 'Agendado', tone: 'neutral' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  checked_in: { label: 'Na recepção', tone: 'warning' },
  in_service: { label: 'Em atendimento', tone: 'brand' },
  completed: { label: 'Concluído', tone: 'success' },
  no_show: { label: 'Faltou', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
  rescheduled: { label: 'Remarcado', tone: 'muted' },
};

export const ENCOUNTER_STATUS: Record<string, { label: string; tone: Tone }> = {
  arrived: { label: 'Aguardando', tone: 'warning' },
  triaged: { label: 'Triado', tone: 'info' },
  in_progress: { label: 'Em atendimento', tone: 'brand' },
  on_hold: { label: 'Pausado', tone: 'muted' },
  finished: { label: 'Finalizado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
  entered_in_error: { label: 'Registrado por engano', tone: 'danger' },
};

export const EXAM_ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ordered: { label: 'Solicitado', tone: 'warning' },
  partially_resulted: { label: 'Parcial', tone: 'info' },
  resulted: { label: 'Resultado disponível', tone: 'brand' },
  reviewed: { label: 'Revisado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
};

export const EXAM_ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'Solicitado', tone: 'neutral' },
  collected: { label: 'Coletado', tone: 'info' },
  sent: { label: 'Enviado', tone: 'info' },
  in_progress: { label: 'Em análise', tone: 'warning' },
  resulted: { label: 'Resultado', tone: 'brand' },
  reviewed: { label: 'Revisado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
};

export const PRESCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'warning' },
  signed: { label: 'Assinada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'muted' },
  entered_in_error: { label: 'Registrada por engano', tone: 'danger' },
};

export const NOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'warning' },
  final: { label: 'Assinada', tone: 'success' },
  amended: { label: 'Retificada', tone: 'info' },
  entered_in_error: { label: 'Anulada', tone: 'danger' },
};

export const PATIENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Ativo', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'muted' },
  deceased: { label: 'Óbito', tone: 'danger' },
  transferred: { label: 'Transferido', tone: 'muted' },
};

export const NOTE_KIND: Record<string, string> = {
  triage: 'Triagem',
  chief_complaint: 'Queixa principal',
  history: 'Anamnese',
  physical_exam: 'Exame físico',
  assessment: 'Avaliação',
  plan: 'Conduta',
  progress: 'Evolução',
  nursing: 'Enfermagem',
  procedure_note: 'Procedimento',
  anesthesia_note: 'Anestesia',
  discharge_summary: 'Alta',
  addendum: 'Adendo',
  free: 'Observações',
};

/** Ordem em que as seções aparecem no atendimento e no prontuário. */
export const NOTE_ORDER = [
  'triage',
  'chief_complaint',
  'history',
  'physical_exam',
  'assessment',
  'plan',
  'procedure_note',
  'anesthesia_note',
  'nursing',
  'progress',
  'discharge_summary',
  'addendum',
  'free',
] as const;

export const DIAGNOSIS_KIND: Record<string, string> = {
  differential: 'Diferencial',
  presumptive: 'Presuntivo',
  final: 'Definitivo',
  ruled_out: 'Descartado',
};

export const SEX: Record<string, string> = {
  male: 'Macho',
  female: 'Fêmea',
  unknown: 'Não informado',
};

export const REPRODUCTIVE_STATUS: Record<string, string> = {
  intact: 'Inteiro',
  neutered: 'Castrado',
  spayed: 'Castrada',
  unknown: 'Não informado',
};

export const GUARDIAN_ROLE: Record<string, string> = {
  owner: 'Tutor',
  co_owner: 'Cotutor',
  financial_responsible: 'Responsável financeiro',
  authorized_contact: 'Contato autorizado',
  caretaker: 'Cuidador',
  institution: 'Instituição',
};

export const IDENTIFIER_SCHEME: Record<string, string> = {
  microchip: 'Microchip',
  ear_tag: 'Brinco',
  sisbov: 'SISBOV',
  leg_band: 'Anilha',
  passport: 'Passaporte',
  registry: 'Registro',
  tattoo: 'Tatuagem',
  license: 'Licença',
  internal: 'Código interno',
};

export const ROUTE: Record<string, string> = {
  oral: 'Oral',
  sc: 'Subcutânea',
  im: 'Intramuscular',
  iv: 'Intravenosa',
  im_pectoral: 'Intramuscular peitoral',
  topical: 'Tópica',
  ophthalmic: 'Oftálmica',
  otic: 'Otológica',
  inhalation: 'Inalatória',
  intranasal: 'Intranasal',
  sublingual: 'Sublingual',
  rectal: 'Retal',
  intramammary: 'Intramamária',
  intrauterine: 'Intrauterina',
  epidural: 'Epidural',
  intracoelomic: 'Intracelomática',
  other: 'Outra',
};

export const SERVICE_CATEGORY: Record<string, string> = {
  consultation: 'Consulta',
  return: 'Retorno',
  vaccination: 'Vacinação',
  preventive: 'Preventivo',
  exam: 'Exame',
  procedure: 'Procedimento',
  surgery: 'Cirurgia',
  hospital_day: 'Internação',
  grooming: 'Estética',
  telehealth: 'Teleorientação',
  other: 'Outro',
};

export const ENCOUNTER_CLASS: Record<string, string> = {
  outpatient: 'Ambulatorial',
  emergency: 'Urgência',
  inpatient: 'Internação',
  surgery: 'Cirurgia',
  home_visit: 'Domiciliar',
  field: 'Campo',
  telehealth: 'Teleatendimento',
};

export const DISPOSITION: Record<string, string> = {
  discharged: 'Alta',
  referred: 'Encaminhado',
  admitted: 'Internado',
  deceased: 'Óbito',
  transferred: 'Transferido',
};

export const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  mild: { label: 'Leve', tone: 'info' },
  moderate: { label: 'Moderada', tone: 'warning' },
  severe: { label: 'Grave', tone: 'danger' },
  unknown: { label: 'Não classificada', tone: 'muted' },
};

export const ALERT_KIND: Record<string, string> = {
  aggressive: 'Manejo com cuidado',
  contagious: 'Risco de contágio',
  financial_block: 'Restrição financeira',
  special_diet: 'Dieta especial',
  no_guardian: 'Sem tutor vinculado',
  other: 'Atenção',
};

export const ABNORMAL_FLAG: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Abaixo', tone: 'warning' },
  normal: { label: 'Normal', tone: 'success' },
  high: { label: 'Acima', tone: 'warning' },
  critical: { label: 'Crítico', tone: 'danger' },
};

export const TIMELINE_KIND: Record<string, string> = {
  'patient.created': 'Paciente cadastrado',
  'appointment.scheduled': 'Agendamento',
  'appointment.cancelled': 'Agendamento cancelado',
  'encounter.started': 'Atendimento iniciado',
  'encounter.finished': 'Atendimento finalizado',
  'note.signed': 'Nota assinada',
  'observation.recorded': 'Sinais vitais',
  'weight.recorded': 'Peso registrado',
  'diagnosis.recorded': 'Diagnóstico',
  'procedure.performed': 'Procedimento',
  'prescription.signed': 'Receita assinada',
  'exam.ordered': 'Exame solicitado',
  'exam.resulted': 'Resultado de exame',
  'immunization.applied': 'Vacina aplicada',
  'preventive.applied': 'Preventivo aplicado',
  'allergy.added': 'Alergia registrada',
  'document.added': 'Documento',
  'patient.deceased': 'Óbito registrado',
};

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function labelFor(map: Record<string, string>, value: string | null | undefined, fallback = ''): string {
  if (!value) return fallback;
  return map[value] ?? value;
}

export function statusFor(
  map: Record<string, { label: string; tone: Tone }>,
  value: string | null | undefined,
): { label: string; tone: Tone } {
  if (!value) return { label: '', tone: 'neutral' };
  return map[value] ?? { label: value, tone: 'neutral' };
}
