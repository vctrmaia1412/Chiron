"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  initialAppointments,
  initialClinicalEvents,
  initialClinicalRecords,
  initialDocuments,
  initialExams,
  initialNotifications,
  initialOrganizations,
  initialPatients,
  initialPrescriptions,
  initialTimeline,
  initialTutors,
  initialVaccines,
  initialVeterinarians,
  modules,
  type Appointment,
  type ClinicalEvent,
  type ClinicalRecord,
  type DocumentRecord,
  type ExamRecord,
  type ModuleItem,
  type NotificationItem,
  type Organization,
  type Patient,
  type Prescription,
  type TimelineEvent,
  type Tutor,
  type User,
  type VaccineRecord,
  type Veterinarian,
  initialUser,
  DEFAULT_ORGANIZATION_ID,
} from "@/mocks/data";

export type AppToast = {
  id: number;
  title: string;
  message: string;
  variant: "success" | "info" | "warning" | "error";
};

type AppContextValue = {
  patients: Patient[];
  tutors: Tutor[];
  appointments: Appointment[];
  veterinarians: Veterinarian[];
  timelines: TimelineEvent[];
  prescriptions: Prescription[];
  exams: ExamRecord[];
  vaccines: VaccineRecord[];
  documents: DocumentRecord[];
  clinicalRecords: ClinicalRecord[];
  clinicalEvents: ClinicalEvent[];
  modules: ModuleItem[];
  notifications: NotificationItem[];
  organizations: Organization[];
  currentOrgId: string;
  user: User;
  searchOpen: boolean;
  notificationsOpen: boolean;
  toasts: AppToast[];
  setSearchOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setCurrentOrgId: (orgId: string) => void;
  addToast: (title: string, message: string, variant?: AppToast["variant"]) => void;
  removeToast: (id: number) => void;
  addPatient: (patient: Omit<Patient, "id" | "avatarColor"> & { organizationId?: string; name: string; owner: string; breed: string; specie: string; sex: string; weight: string; age: string }) => void;
  updatePatient: (patientId: string, updates: Partial<Patient>) => void;
  deletePatient: (patientId: string) => void;
  addAppointment: (appointment: Omit<Appointment, "id" | "color" | "tenantId" | "patientId" | "veterinarianId" | "doctor"> & { organizationId?: string; patientId?: string; tenantId?: string; veterinarianId?: string; patient: string; doctor?: string; type: Appointment["type"]; status?: Appointment["status"]; priority?: Appointment["priority"]; date: string; time: string; tutor?: string; notes?: string; }) => void;
  createAppointment: (appointment: Omit<Appointment, "id" | "color" | "tenantId" | "patientId" | "veterinarianId" | "doctor"> & { organizationId?: string; patientId?: string; tenantId?: string; veterinarianId?: string; patient: string; doctor?: string; type: Appointment["type"]; status?: Appointment["status"]; priority?: Appointment["priority"]; date: string; time: string; tutor?: string; notes?: string; }) => void;
  updateAppointment: (appointmentId: string, updates: Partial<Appointment>) => void;
  startAppointment: (appointmentId: string) => void;
  pauseAppointment: (appointmentId: string) => void;
  finishAppointment: (appointmentId: string) => void;
  addTimelineEvent: (event: Omit<TimelineEvent, "id">) => void;
  updateClinicalRecord: (record: Partial<ClinicalRecord> & { patientId: string; appointmentId?: string; veterinarianId?: string; tenantId?: string }) => void;
  addPrescription: (prescription: Prescription) => void;
  addExam: (exam: ExamRecord) => void;
  addVaccine: (vaccine: VaccineRecord) => void;
  addDocument: (document: DocumentRecord) => void;
  toggleModule: (moduleId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  getPatientById: (patientId: string) => Patient | undefined;
  getTutorById: (tutorId: string) => Tutor | undefined;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const storageKey = "chiron-state-v1";

  const getInitialPersistedState = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return null;

      return JSON.parse(saved) as {
        patients?: Patient[];
        appointments?: Appointment[];
        clinicalRecords?: ClinicalRecord[];
        prescriptions?: Prescription[];
        exams?: ExamRecord[];
        documents?: DocumentRecord[];
        vaccines?: VaccineRecord[];
        timelines?: TimelineEvent[];
        notifications?: NotificationItem[];
      };
    } catch (error) {
      console.warn("Could not restore persisted CHIRON state", error);
      return null;
    }
  }, []);

  const getStoredState = useCallback(() => {
    const persistedState = getInitialPersistedState();
    return {
      patients: persistedState?.patients ?? initialPatients,
      appointments: persistedState?.appointments ?? initialAppointments,
      timelines: persistedState?.timelines ?? initialTimeline,
      prescriptions: persistedState?.prescriptions ?? initialPrescriptions,
      exams: persistedState?.exams ?? initialExams,
      vaccines: persistedState?.vaccines ?? initialVaccines,
      documents: persistedState?.documents ?? initialDocuments,
      clinicalRecords: persistedState?.clinicalRecords ?? initialClinicalRecords,
      notifications: persistedState?.notifications ?? initialNotifications,
    };
  }, [getInitialPersistedState]);

  const [patients, setPatients] = useState<Patient[]>(() => getStoredState().patients);
  const [tutors, setTutors] = useState<Tutor[]>(initialTutors);
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredState().appointments);
  const [veterinarians] = useState<Veterinarian[]>(initialVeterinarians);
  const [timelines, setTimelines] = useState<TimelineEvent[]>(() => getStoredState().timelines);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => getStoredState().prescriptions);
  const [exams, setExams] = useState<ExamRecord[]>(() => getStoredState().exams);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>(() => getStoredState().vaccines);
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => getStoredState().documents);
  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecord[]>(() => getStoredState().clinicalRecords);
  const [clinicalEvents, setClinicalEvents] = useState<ClinicalEvent[]>(initialClinicalEvents);
  const [appModules, setAppModules] = useState<ModuleItem[]>(modules);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getStoredState().notifications);
  const [organizations] = useState<Organization[]>([
    ...initialOrganizations,
    ...(initialOrganizations.some((organization) => organization.id === DEFAULT_ORGANIZATION_ID) ? [] : [{ id: DEFAULT_ORGANIZATION_ID, name: "CHIRON Demo" }]),
  ]);
  const [currentOrgId, setCurrentOrgId] = useState(DEFAULT_ORGANIZATION_ID);
  const [user] = useState<User>(initialUser);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const addToast = useCallback((title: string, message: string, variant: AppToast["variant"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 2600);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        patients,
        appointments,
        clinicalRecords,
        prescriptions,
        exams,
        documents,
        vaccines,
        timelines,
        notifications,
      }),
    );
  }, [appointments, clinicalRecords, documents, exams, notifications, patients, prescriptions, timelines, vaccines]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const getPatientById = useCallback((patientId: string) => patients.find((patient) => patient.id === patientId), [patients]);
  const getTutorById = useCallback((tutorId: string) => tutors.find((tutor) => tutor.id === tutorId), [tutors]);

  const addPatient = useCallback((patient: Omit<Patient, "id" | "avatarColor"> & { organizationId?: string; name: string; owner: string; breed: string; specie: string; sex: string; weight: string; age: string }) => {
    const finalPatient: Patient = {
      ...patient,
      id: `patient-${Date.now()}`,
      organizationId: currentOrgId,
      avatarColor: "bg-gradient-to-br from-emerald-500 to-teal-700",
      ownerEmail: patient.ownerEmail ?? "contato@mock.com",
      ownerPhone: patient.ownerPhone ?? "(11) 99999-0000",
      allergies: patient.allergies ?? ["Nenhuma"],
      notes: patient.notes ?? ["Paciente recém-cadastrado"],
    };

    setPatients((prev) => [finalPatient, ...prev]);

    setTutors((prev) => {
      const existingTutor = patient.tutorId ? prev.find((tutor) => tutor.id === patient.tutorId) : undefined;
      if (existingTutor) {
        return prev.map((tutor) =>
          tutor.id === existingTutor.id
            ? { ...tutor, organizationId: currentOrgId, patients: [...new Set([...tutor.patients, finalPatient.id])] }
            : tutor,
        );
      }

      const newTutor: Tutor = {
        id: `tutor-${Date.now()}`,
        organizationId: currentOrgId,
        name: patient.owner,
        email: finalPatient.ownerEmail,
        phone: finalPatient.ownerPhone,
        address: "Endereço a confirmar",
        patients: [finalPatient.id],
      };

      return [newTutor, ...prev];
    });
  }, [currentOrgId]);

  const updatePatient = useCallback((patientId: string, updates: Partial<Patient>) => {
    setPatients((prev) => prev.map((patient) => (patient.id === patientId ? { ...patient, ...updates } : patient)));
  }, []);

  const deletePatient = useCallback((patientId: string) => {
    setPatients((prev) => prev.filter((patient) => patient.id !== patientId));
    setTutors((prev) =>
      prev
        .map((tutor) => ({ ...tutor, patients: tutor.patients.filter((id) => id !== patientId) }))
        .filter((tutor) => tutor.patients.length > 0),
    );
    setDocuments((prev) => prev.filter((document) => document.patientId !== patientId));
    setExams((prev) => prev.filter((exam) => exam.patientId !== patientId));
    setPrescriptions((prev) => prev.filter((prescription) => prescription.patientId !== patientId));
    setVaccines((prev) => prev.filter((vaccine) => vaccine.patientId !== patientId));
    setTimelines((prev) => prev.filter((event) => event.patientId !== patientId));
  }, []);

  const createAppointment = useCallback((appointment: Omit<Appointment, "id" | "color" | "tenantId" | "patientId" | "veterinarianId" | "doctor"> & { organizationId?: string; patientId?: string; tenantId?: string; veterinarianId?: string; patient: string; doctor?: string; type: Appointment["type"]; status?: Appointment["status"]; priority?: Appointment["priority"]; date: string; time: string; tutor?: string; notes?: string; }) => {
    const resolvedPatientId = appointment.patientId;
    const patient = patients.find((item) => item.id === resolvedPatientId);

    if (!resolvedPatientId || !patient) {
      addToast("Paciente obrigatório", "Selecione um paciente válido para criar o atendimento.", "warning");
      return;
    }

    const resolvedStatus = appointment.status ?? "scheduled";
    const vetName = appointment.doctor ?? "Dra. Amanda";
    const created: Appointment = {
      ...appointment,
      id: `appt-${Date.now()}`,
      organizationId: currentOrgId,
      tenantId: appointment.tenantId ?? "tenant-demo",
      patientId: resolvedPatientId,
      veterinarianId: appointment.veterinarianId ?? "vet-ana",
      doctor: vetName,
      patient: patient.name,
      tutor: appointment.tutor ?? patient.owner,
      status: resolvedStatus,
      color: appointment.type === "Vacinação" ? "bg-sky-100 text-sky-700" : appointment.type === "Retorno" ? "bg-amber-100 text-amber-700" : appointment.type === "Exame" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700",
      scheduledAt: `${appointment.date}T${appointment.time}:00`,
      durationMinutes: appointment.durationMinutes ?? 45,
    };

    setAppointments((prev) => [created, ...prev]);
    setTimelines((prev) => [{
      id: `event-${Date.now()}`,
      organizationId: currentOrgId,
      date: new Date().toLocaleDateString("pt-BR"),
      title: "Atendimento agendado",
      detail: `${created.patient} · ${created.type}`,
      doctor: created.doctor,
      tag: "Atendimento",
      patientId: created.patientId,
    }, ...prev]);
  }, [addToast, currentOrgId, patients]);

  const addAppointment = useCallback((appointment: Omit<Appointment, "id" | "color" | "tenantId" | "patientId" | "veterinarianId" | "doctor"> & { organizationId?: string; patientId?: string; tenantId?: string; veterinarianId?: string; patient: string; doctor?: string; type: Appointment["type"]; status?: Appointment["status"]; priority?: Appointment["priority"]; date: string; time: string; tutor?: string; notes?: string; }) => {
    createAppointment(appointment);
  }, [createAppointment]);

  const updateAppointment = useCallback((appointmentId: string, updates: Partial<Appointment>) => {
    setAppointments((prev) => prev.map((appointment) => (appointment.id === appointmentId ? { ...appointment, ...updates } : appointment)));
  }, []);

  const startAppointment = useCallback((appointmentId: string) => {
    setAppointments((prev) =>
      prev.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, status: "in_progress", startedAt: new Date().toISOString() } : appointment,
      ),
    );
  }, []);

  const pauseAppointment = useCallback((appointmentId: string) => {
    setAppointments((prev) =>
      prev.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, status: "paused" } : appointment,
      ),
    );
  }, []);

  const finishAppointment = useCallback((appointmentId: string) => {
    setAppointments((prev) =>
      prev.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, status: "finished", finishedAt: new Date().toISOString() } : appointment,
      ),
    );
  }, []);

  const addTimelineEvent = useCallback((event: Omit<TimelineEvent, "id">) => {
    setTimelines((prev) => [{ ...event, id: `event-${Date.now()}` }, ...prev]);
  }, []);

  const updateClinicalRecord = useCallback((record: Partial<ClinicalRecord> & { patientId: string; appointmentId?: string; veterinarianId?: string; tenantId?: string; organizationId?: string; status?: ClinicalRecord["status"] }) => {
    const baseRecord: ClinicalRecord = {
      id: record.id ?? `record-${Date.now()}`,
      organizationId: record.organizationId ?? currentOrgId,
      tenantId: record.tenantId ?? "tenant-demo",
      patientId: record.patientId,
      appointmentId: record.appointmentId ?? "",
      veterinarianId: record.veterinarianId ?? "vet-ana",
      chiefComplaint: record.chiefComplaint ?? "",
      anamnesis: record.anamnesis ?? "",
      physicalExam: record.physicalExam ?? "",
      vitalSigns: record.vitalSigns ?? "",
      assessment: record.assessment ?? "",
      diagnosis: record.diagnosis ?? "",
      conduct: record.conduct ?? "",
      status: record.status ?? "Em elaboração",
      createdAt: record.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setClinicalRecords((prev) => {
      const existing = prev.find((item) => item.patientId === record.patientId && item.appointmentId === baseRecord.appointmentId);
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...existing, ...baseRecord, updatedAt: new Date().toISOString() } : item));
      }
      return [baseRecord, ...prev];
    });

    setClinicalEvents((prev) => [
      {
        id: `event-clinical-${Date.now()}`,
        organizationId: currentOrgId,
        tenantId: "tenant-demo",
        patientId: record.patientId,
        appointmentId: baseRecord.appointmentId,
        clinicalRecordId: baseRecord.id,
        type: "Atendimento",
        title: "Atendimento registrado",
        description: `${baseRecord.diagnosis || "Atendimento atualizado"}`,
        createdAt: new Date().toISOString(),
        createdBy: "Dra. Amanda",
      },
      ...prev,
    ]);
  }, [currentOrgId]);

  const addPrescription = useCallback((prescription: Prescription) => {
    const nextPrescription: Prescription = {
      ...prescription,
      organizationId: prescription.organizationId ?? currentOrgId,
    };

    setPrescriptions((prev) => [nextPrescription, ...prev]);
    setTimelines((prev) => [
      {
        id: `event-${Date.now()}`,
        organizationId: nextPrescription.organizationId,
        date: nextPrescription.date,
        title: "Receita",
        detail: `${nextPrescription.items.length} medicamento(s) registrado(s)`,
        doctor: nextPrescription.doctor,
        tag: "Receita",
        patientId: nextPrescription.patientId,
        appointmentId: nextPrescription.appointmentId,
        clinicalRecordId: nextPrescription.clinicalRecordId,
      },
      ...prev,
    ]);
  }, [currentOrgId]);

  const addExam = useCallback((exam: ExamRecord) => {
    const nextExam: ExamRecord = {
      ...exam,
      organizationId: exam.organizationId ?? currentOrgId,
    };

    setExams((prev) => [nextExam, ...prev]);
    setTimelines((prev) => [
      {
        id: `event-${Date.now()}`,
        organizationId: nextExam.organizationId,
        date: new Date().toLocaleDateString("pt-BR"),
        title: "Exame solicitado",
        detail: nextExam.name,
        doctor: "Dra. Amanda",
        tag: "Exame",
        patientId: nextExam.patientId,
        appointmentId: nextExam.appointmentId,
        clinicalRecordId: nextExam.clinicalRecordId,
      },
      ...prev,
    ]);
  }, [currentOrgId]);

  const addVaccine = useCallback((vaccine: VaccineRecord) => {
    const nextVaccine: VaccineRecord = {
      ...vaccine,
      organizationId: vaccine.organizationId ?? currentOrgId,
    };

    setVaccines((prev) => [nextVaccine, ...prev]);
    setTimelines((prev) => [
      {
        id: `event-${Date.now()}`,
        organizationId: nextVaccine.organizationId,
        date: nextVaccine.date,
        title: "Vacinação",
        detail: nextVaccine.name,
        doctor: nextVaccine.doctor,
        tag: "Vacina",
        patientId: nextVaccine.patientId,
      },
      ...prev,
    ]);
  }, [currentOrgId]);

  const addDocument = useCallback((document: DocumentRecord) => {
    const nextDocument: DocumentRecord = {
      ...document,
      organizationId: document.organizationId ?? currentOrgId,
    };

    setDocuments((prev) => [nextDocument, ...prev]);
    setTimelines((prev) => [
      {
        id: `event-${Date.now()}`,
        organizationId: nextDocument.organizationId,
        date: nextDocument.date,
        title: "Documento",
        detail: nextDocument.name,
        doctor: "Dra. Amanda",
        tag: "Documento",
        patientId: nextDocument.patientId,
        appointmentId: nextDocument.appointmentId,
        clinicalRecordId: nextDocument.clinicalRecordId,
      },
      ...prev,
    ]);
  }, [currentOrgId]);

  const toggleModule = useCallback((moduleId: string) => {
    setAppModules((prev) => 
      prev.map((module) =>
        module.id === moduleId
          ? { ...module, status: module.status === "Ativo" ? "Disponível" : "Ativo" }
          : module,
      ),
    );
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification,
      ),
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      patients,
      tutors,
      appointments,
      veterinarians,
      timelines,
      prescriptions,
      exams,
      vaccines,
      documents,
      clinicalRecords,
      clinicalEvents,
      modules: appModules,
      notifications,
      organizations,
      currentOrgId,
      user,
      searchOpen,
      notificationsOpen,
      toasts,
      setSearchOpen,
      setNotificationsOpen,
      setCurrentOrgId,
      addToast,
      removeToast,
      addPatient,
      updatePatient,
      deletePatient,
      addAppointment,
      createAppointment,
      updateAppointment,
      startAppointment,
      pauseAppointment,
      finishAppointment,
      addTimelineEvent,
      updateClinicalRecord,
      addPrescription,
      addExam,
      addVaccine,
      addDocument,
      toggleModule,
      markNotificationRead,
      markAllNotificationsRead,
      getPatientById,
      getTutorById,
    }),
    [addAppointment, addDocument, addExam, addPatient, addPrescription, addToast, addTimelineEvent, addVaccine, appointments, appModules, clinicalEvents, clinicalRecords, createAppointment, currentOrgId, deletePatient, documents, exams, finishAppointment, getPatientById, getTutorById, markAllNotificationsRead, markNotificationRead, notifications, notificationsOpen, organizations, patients, pauseAppointment, prescriptions, removeToast, searchOpen, startAppointment, timelines, toasts, toggleModule, tutors, updateAppointment, updateClinicalRecord, updatePatient, user, vaccines, veterinarians],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[300px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border p-3 shadow-lg ${
              toast.variant === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : toast.variant === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : toast.variant === "error"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-sky-200 bg-sky-50 text-sky-900"
            }`}
          >
            <div className="text-sm font-semibold">{toast.title}</div>
            <div className="mt-1 text-xs opacity-80">{toast.message}</div>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }

  return context;
}
