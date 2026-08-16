export type Patient = {
  id: string;
  organizationId: string;
  tenantId?: string;
  tutorId?: string;
  name: string;
  specie: string;
  breed: string;
  sex: string;
  age: string;
  weight: string;
  owner: string;
  status: "Ativo" | "Retorno" | "Atenção";
  avatarColor: string;
  ownerEmail: string;
  ownerPhone: string;
  allergies?: string[];
  notes?: string[];
  microchip?: string;
  internalCode?: string;
};

export type Tutor = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  patients: string[];
};

export type AppointmentStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "paused"
  | "finished"
  | "cancelled"
  | "Agendado"
  | "Confirmado"
  | "Em atendimento"
  | "Concluído"
  | "Cancelado"
  | "Pendente";

export type AppointmentType =
  | "Consulta"
  | "Retorno"
  | "Vacinação"
  | "Urgência"
  | "Avaliação"
  | "Procedimento"
  | "Cirurgia"
  | "Exame"
  | "Internação"
  | "Outro";

export type AppointmentPriority = "normal" | "priority" | "urgent" | "Normal" | "Prioridade" | "Urgente";

export type Appointment = {
  id: string;
  organizationId: string;
  tenantId: string;
  patientId: string;
  veterinarianId: string;
  time?: string;
  patient: string;
  type: AppointmentType;
  doctor: string;
  status: AppointmentStatus;
  color: string;
  date: string;
  tutor?: string;
  notes?: string;
  scheduledAt?: string;
  startedAt?: string;
  finishedAt?: string;
  priority?: AppointmentPriority;
  durationMinutes?: number;
};

export type TimelineEvent = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId?: string;
  clinicalRecordId?: string;
  date: string;
  title: string;
  detail: string;
  doctor: string;
  tag: "Consulta" | "Exame" | "Vacina" | "Peso" | "Receita" | "Documento" | "Atendimento";
  anexos?: number;
};

export type ModuleItem = {
  id: string;
  name: string;
  description: string;
  status: "Ativo" | "Disponível";
};

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
};

export type PrescriptionItem = {
  id: string;
  name: string;
  active: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  notes: string;
};

export type Prescription = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId?: string;
  clinicalRecordId?: string;
  doctor: string;
  date: string;
  items: PrescriptionItem[];
};

export type ExamRecord = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId?: string;
  clinicalRecordId?: string;
  name: string;
  lab: string;
  priority: "Alta" | "Média" | "Baixa";
  status: "Solicitado" | "Coleta realizada" | "Resultado disponível" | "Revisado";
  observations: string;
  result?: string;
};

export type VaccineRecord = {
  id: string;
  organizationId: string;
  patientId: string;
  name: string;
  date: string;
  lab: string;
  lot: string;
  nextDose: string;
  doctor: string;
};

export type DocumentRecord = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId?: string;
  clinicalRecordId?: string;
  name: string;
  type: string;
  date: string;
  size: string;
};

export type Organization = {
  id: string;
  name: string;
};

export type Veterinarian = {
  id: string;
  name: string;
  specialty: string;
};

export type ClinicalRecord = {
  id: string;
  organizationId: string;
  tenantId: string;
  patientId: string;
  appointmentId: string;
  veterinarianId: string;
  chiefComplaint: string;
  anamnesis: string;
  physicalExam: string;
  vitalSigns: string;
  assessment: string;
  diagnosis: string;
  conduct: string;
  status: "Em elaboração" | "Concluído" | "Arquivado";
  createdAt: string;
  updatedAt: string;
};

export type ClinicalEvent = {
  id: string;
  organizationId: string;
  tenantId: string;
  patientId: string;
  appointmentId?: string;
  clinicalRecordId?: string;
  type: "Consulta" | "Vacinação" | "Exame" | "Receita" | "Documento" | "Atendimento";
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
};

export type User = {
  id: string;
  name: string;
  role: string;
};

export const dashboardMetrics = [
  { value: "08", label: "Consultas hoje", tone: "emerald" },
  { value: "12", label: "Pacientes", tone: "slate" },
  { value: "03", label: "Retornos", tone: "amber" },
  { value: "02", label: "Exames pendentes", tone: "blue" },
];

export const initialOrganizations: Organization[] = [
  { id: "clinic-example", name: "Clínica Exemplo" },
  { id: "hospital-example", name: "Hospital Veterinário Exemplo" },
  { id: "consultorio-ana", name: "Consultório Ana" },
];

export const initialUser: User = { id: "u-1", name: "Fábio N.", role: "Veterinário" };

export const DEFAULT_ORGANIZATION_ID = "org-demo";

export const initialTutors: Tutor[] = [
  { id: "tutor-1", organizationId: DEFAULT_ORGANIZATION_ID, name: "João Silva", email: "joao.silva@email.com", phone: "(11) 99876-1234", address: "Rua das Flores, 210, São Paulo", patients: ["thor"] },
  { id: "tutor-2", organizationId: DEFAULT_ORGANIZATION_ID, name: "Maria Souza", email: "maria.souza@email.com", phone: "(11) 99123-4567", address: "Avenida Paulista, 1250, São Paulo", patients: ["luna"] },
  { id: "tutor-3", organizationId: DEFAULT_ORGANIZATION_ID, name: "Fazenda Boa Vista", email: "veterinario@fazendaboavista.com.br", phone: "(17) 3321-8890", address: "Estrada do Cervo, km 12, Bauru", patients: ["bov-0248"] },
  { id: "tutor-4", organizationId: DEFAULT_ORGANIZATION_ID, name: "Centro de Fauna", email: "fauna@centro.com.br", phone: "(21) 98765-1111", address: "Avenida da Natureza, 40, Rio de Janeiro", patients: ["loro"] },
];

export const initialPatients: Patient[] = [
  {
    id: "thor",
    organizationId: DEFAULT_ORGANIZATION_ID,
    name: "Thor",
    specie: "Cão",
    breed: "Golden Retriever",
    sex: "Macho",
    age: "6 anos",
    weight: "32,4 kg",
    owner: "João Silva",
    status: "Ativo",
    avatarColor: "bg-gradient-to-br from-emerald-500 to-teal-700",
    ownerEmail: "joao.silva@email.com",
    ownerPhone: "(11) 99876-1234",
    allergies: ["Nenhuma"],
    notes: ["Animal dócil", "Alergia à penicilina"],
    tutorId: "tutor-1",
  },
  {
    id: "luna",
    organizationId: DEFAULT_ORGANIZATION_ID,
    name: "Luna",
    specie: "Gato",
    breed: "SRD",
    sex: "Fêmea",
    age: "4 anos",
    weight: "4,2 kg",
    owner: "Maria Souza",
    status: "Retorno",
    avatarColor: "bg-gradient-to-br from-sky-500 to-indigo-700",
    ownerEmail: "maria.souza@email.com",
    ownerPhone: "(11) 99123-4567",
    allergies: ["Sem alergias"],
    notes: ["Recebeu acompanhamento clínico"],
    tutorId: "tutor-2",
  },
  {
    id: "bov-0248",
    organizationId: DEFAULT_ORGANIZATION_ID,
    name: "BOV-0248",
    specie: "Bovino",
    breed: "Nelore",
    sex: "Fêmea",
    age: "3 anos",
    weight: "420 kg",
    owner: "Fazenda Boa Vista",
    status: "Atenção",
    avatarColor: "bg-gradient-to-br from-amber-500 to-orange-700",
    ownerEmail: "veterinario@fazendaboavista.com.br",
    ownerPhone: "(17) 3321-8890",
    allergies: ["N/A"],
    notes: ["Monitoramento reprodutivo"],
    tutorId: "tutor-3",
  },
  {
    id: "loro",
    organizationId: DEFAULT_ORGANIZATION_ID,
    name: "Loro",
    specie: "Ave",
    breed: "Psittaciforme",
    sex: "Macho",
    age: "2 anos",
    weight: "0,8 kg",
    owner: "Centro de Fauna",
    status: "Ativo",
    avatarColor: "bg-gradient-to-br from-violet-500 to-fuchsia-700",
    ownerEmail: "fauna@centro.com.br",
    ownerPhone: "(21) 98765-1111",
    allergies: ["Sem alergias"],
    notes: ["Avaliação de plumagem"],
    tutorId: "tutor-4",
  },
];

export const initialAppointments: Appointment[] = [
  { id: "appt-1", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "thor", veterinarianId: "vet-ana", time: "09:00", patient: "Thor", type: "Consulta", doctor: "Dra. Amanda", status: "in_progress", color: "bg-emerald-100 text-emerald-700", date: "2026-08-13", tutor: "João Silva", notes: "Consulta de rotina", scheduledAt: "2026-08-13T09:00:00", startedAt: "2026-08-13T09:05:00", priority: "priority", durationMinutes: 45 },
  { id: "appt-2", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "luna", veterinarianId: "vet-carlos", time: "09:30", patient: "Luna", type: "Retorno", doctor: "Dr. Carlos", status: "waiting", color: "bg-amber-100 text-amber-700", date: "2026-08-13", tutor: "Maria Souza", notes: "Acompanhamento do caso", scheduledAt: "2026-08-13T09:30:00", priority: "normal", durationMinutes: 30 },
  { id: "appt-3", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "thor", veterinarianId: "vet-ana", time: "10:00", patient: "Thor", type: "Vacinação", doctor: "Dra. Amanda", status: "finished", color: "bg-sky-100 text-sky-700", date: "2026-08-13", tutor: "João Silva", notes: "V10", scheduledAt: "2026-08-13T10:00:00", finishedAt: "2026-08-13T10:35:00", priority: "normal", durationMinutes: 35 },
];

export const initialTimeline: TimelineEvent[] = [
  { id: "event-1", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", date: "12/08/2026", title: "Consulta", detail: "Gastroenterite aguda", doctor: "Dra. Amanda", tag: "Consulta", anexos: 3 },
  { id: "event-2", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", date: "05/07/2026", title: "Exame laboratorial", detail: "Hemograma completo", doctor: "Laboratório VetCare", tag: "Exame", anexos: 2 },
  { id: "event-3", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-3", date: "10/06/2026", title: "Vacinação", detail: "V10 Importada", doctor: "Dra. Amanda", tag: "Vacina" },
  { id: "event-4", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", date: "22/05/2026", title: "Peso", detail: "32,4 kg", doctor: "Enfermaria", tag: "Peso" },
];

export const patientList = initialPatients;
export const timelineEvents = initialTimeline;

export const initialDocuments: DocumentRecord[] = [
  { id: "doc-1", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", name: "Laudo de hemograma.pdf", type: "Exame", date: "12/08/2026", size: "1.2 MB" },
  { id: "doc-2", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", name: "Receita 2026-08-12.pdf", type: "Receita", date: "12/08/2026", size: "400 KB" },
  { id: "doc-3", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", name: "Termo de consentimento.pdf", type: "Consentimento", date: "12/08/2026", size: "760 KB" },
];

export const initialVeterinarians: Veterinarian[] = [
  { id: "vet-ana", name: "Dra. Amanda", specialty: "Clínica geral" },
  { id: "vet-carlos", name: "Dr. Carlos", specialty: "Cardiologia" },
  { id: "vet-joana", name: "Dra. Joana", specialty: "Dermatologia" },
];

export const initialClinicalRecords: ClinicalRecord[] = [
  {
    id: "record-1",
    organizationId: DEFAULT_ORGANIZATION_ID,
    tenantId: "tenant-demo",
    patientId: "thor",
    appointmentId: "appt-1",
    veterinarianId: "vet-ana",
    chiefComplaint: "Vômitos recorrentes e apatia",
    anamnesis: "Animal com ingestão reduzida e fezes líquidas nas últimas 48h.",
    physicalExam: "Mucosas hidratadas, abdomen sensível no quadrante cranial, sem dor intensa.",
    vitalSigns: "FR 24 rpm · FC 110 bpm · T 39,2°C · Peso 32,4 kg · SpO2 98%",
    assessment: "Gastroenterite aguda",
    diagnosis: "Gastroenterite e desidratação leve",
    conduct: "Hidratação, dieta blanda e antitussígeno conforme protocolo.",
    status: "Concluído",
    createdAt: "2026-08-13T14:30:00",
    updatedAt: "2026-08-13T15:20:00",
  },
];

export const initialClinicalEvents: ClinicalEvent[] = [
  { id: "event-clinical-1", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", type: "Consulta", title: "Consulta", description: "Queixa: vômitos recorrentes; diagnóstico: gastroenterite.", createdAt: "2026-08-13T14:30:00", createdBy: "Dra. Amanda" },
  { id: "event-clinical-2", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "thor", appointmentId: "appt-3", type: "Vacinação", title: "Vacinação", description: "Vacina V10 aplicada com sucesso.", createdAt: "2026-08-13T10:00:00", createdBy: "Dra. Amanda" },
];

export const initialPrescriptions: Prescription[] = [
  { id: "rx-1", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", doctor: "Dra. Amanda", date: "12/08/2026", items: [{ id: "rxi-1", name: "Ondansetrona", active: "Ondansetrona", dose: "5 mg", route: "Oral", frequency: "12/12h", duration: "5 dias", quantity: "10 comprimidos", notes: "Tomar com alimento" }] },
];

export const initialExams: ExamRecord[] = [
  { id: "exam-1", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", name: "Hemograma completo", lab: "Lab VetCare", priority: "Alta", status: "Resultado disponível", observations: "Aguardando revisão", result: "Leucocitose discreta." },
  { id: "exam-2", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", appointmentId: "appt-1", clinicalRecordId: "record-1", name: "Bioquímica sérica", lab: "Lab VetCare", priority: "Média", status: "Coleta realizada", observations: "Coletado em 12/08/2026." },
];

export const initialVaccines: VaccineRecord[] = [
  { id: "vac-1", organizationId: DEFAULT_ORGANIZATION_ID, patientId: "thor", name: "V10 Importada", date: "10/06/2026", lab: "Zoetis", lot: "V10-1024", nextDose: "12/12/2026", doctor: "Dra. Amanda" },
];

export const modules: ModuleItem[] = [
  { id: "agenda", name: "Agenda", description: "Agendamento, bloqueios e consultas do dia", status: "Ativo" },
  { id: "pacientes", name: "Pacientes", description: "Cadastro e histórico clínico do paciente", status: "Ativo" },
  { id: "prontuario", name: "Prontuário", description: "Anamnese, evolução e exames", status: "Ativo" },
  { id: "exames", name: "Exames", description: "Solicitações e resultados laboratoriais", status: "Ativo" },
  { id: "prescricao", name: "Prescrição", description: "Receitas, medicamentos e orientações", status: "Ativo" },
  { id: "vacinas", name: "Vacinação", description: "Registro e vigilância vacinal", status: "Disponível" },
  { id: "financeiro", name: "Financeiro", description: "Contas, recebimentos e faturamento", status: "Disponível" },
  { id: "estoque", name: "Estoque", description: "Medicamentos e materiais", status: "Disponível" },
  { id: "internacao", name: "Internação", description: "Leitos, monitoramento e enfermagem", status: "Disponível" },
  { id: "farmacia", name: "Farmácia", description: "Controle de dispensação e estoque clínico", status: "Disponível" },
  { id: "cirurgia", name: "Centro cirúrgico", description: "Agenda, procedimentos e equipamentos", status: "Disponível" },
  { id: "relatorios", name: "Relatórios", description: "KPI e indicadores clínicos", status: "Disponível" },
];

export const initialNotifications: NotificationItem[] = [
  { id: "n-1", title: "Exame disponível", description: "Hemograma de Thor concluído.", time: "Há 10 min", read: false },
  { id: "n-2", title: "Retorno amanhã", description: "Luna tem retorno agendado para amanhã.", time: "Há 30 min", read: false },
  { id: "n-3", title: "Estoque baixo", description: "Vacina Raiva com estoque crítico.", time: "Há 2h", read: true },
  { id: "n-4", title: "Nova consulta agendada", description: "Consulta de Mel adicionada à agenda.", time: "Hoje", read: false },
];

export const clinicalAlerts = [
  "3 retornos pendentes",
  "2 exames aguardando resultado",
  "4 vacinas próximas do vencimento",
];

export const upcomingAppointments: Appointment[] = [
  { id: "appt-1", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "thor", veterinarianId: "vet-ana", time: "09:00", patient: "Thor", type: "Consulta", doctor: "Dra. Amanda", status: "scheduled", color: "bg-emerald-100 text-emerald-700", date: "2026-08-13", tutor: "João Silva", priority: "normal", durationMinutes: 45 },
  { id: "appt-2", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "luna", veterinarianId: "vet-carlos", time: "09:30", patient: "Luna", type: "Retorno", doctor: "Dr. Carlos", status: "waiting", color: "bg-amber-100 text-amber-700", date: "2026-08-13", tutor: "Maria Souza", priority: "priority", durationMinutes: 30 },
  { id: "appt-3", organizationId: DEFAULT_ORGANIZATION_ID, tenantId: "tenant-demo", patientId: "mel", veterinarianId: "vet-ana", time: "10:00", patient: "Mel", type: "Vacinação", doctor: "Dr. Rafael Costa", status: "scheduled", color: "bg-sky-100 text-sky-700", date: "2026-08-13", tutor: "Carla Mendes", priority: "normal", durationMinutes: 35 },
];

export const patientSummary = {
  fullName: "Adriana Souza Santos",
  phone: "+55 (11) 98632-4411",
  email: "adriana.souza@gmail.com",
  patientName: "Totus",
  species: "Pastor Alemão",
  sex: "Macho",
  weight: "6 kg",
  age: "11 meses",
  status: "Alergia",
  note: "Animal dócil",
};

export const recentDocuments = [
  { name: "Laudo de hemograma.pdf", type: "Exame", size: "1.2 MB" },
  { name: "Receita 2026-08-12.pdf", type: "Receita", size: "400 KB" },
  { name: "Termo de consentimento.pdf", type: "Consentimento", size: "760 KB" },
];
