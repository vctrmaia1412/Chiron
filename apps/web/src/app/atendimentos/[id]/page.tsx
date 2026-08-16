"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Stethoscope, Syringe, ClipboardList, Activity } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { StatusBadge } from "@/components/ui/StatusBadge";

const clinicalSteps = [
  "Paciente",
  "Anamnese",
  "Exame físico",
  "Sinais vitais",
  "Avaliação",
  "Diagnóstico",
  "Conduta",
  "Prescrição",
  "Exames",
  "Documentos",
  "Finalização",
] as const;

const defaultVitalSigns = {
  temperature: "39,2°C",
  heartRate: "110 bpm",
  respiratoryRate: "24 rpm",
  systolic: "120",
  diastolic: "80",
  spo2: "98%",
  weight: "6,0 kg",
  capillaryRefill: "2s",
  notes: "",
};

const parseVitalSigns = (text?: string) => {
  if (!text) return { ...defaultVitalSigns };

  const match = /T\s*([^·]+?)\s*·\s*FC\s*([^·]+?)\s*·\s*FR\s*([^·]+?)\s*·\s*PAS\s*([^·]+?)\s*·\s*PAD\s*([^·]+?)\s*·\s*SpO2\s*([^·]+?)\s*·\s*Peso\s*([^·]+?)\s*·\s*TPC\s*([^·]+?)(?:\s*·\s*Obs:\s*(.+))?$/i.exec(text);

  if (!match) return { ...defaultVitalSigns };

  return {
    temperature: match[1]?.trim() ?? defaultVitalSigns.temperature,
    heartRate: match[2]?.trim() ?? defaultVitalSigns.heartRate,
    respiratoryRate: match[3]?.trim() ?? defaultVitalSigns.respiratoryRate,
    systolic: match[4]?.trim() ?? defaultVitalSigns.systolic,
    diastolic: match[5]?.trim() ?? defaultVitalSigns.diastolic,
    spo2: match[6]?.trim() ?? defaultVitalSigns.spo2,
    weight: match[7]?.trim() ?? defaultVitalSigns.weight,
    capillaryRefill: match[8]?.trim() ?? defaultVitalSigns.capillaryRefill,
    notes: match[9]?.trim() ?? "",
  };
};

const formatVitalSigns = (vitalSigns: typeof defaultVitalSigns) => {
  const values = [
    `T ${vitalSigns.temperature}`,
    `FC ${vitalSigns.heartRate}`,
    `FR ${vitalSigns.respiratoryRate}`,
    `PAS ${vitalSigns.systolic}`,
    `PAD ${vitalSigns.diastolic}`,
    `SpO2 ${vitalSigns.spo2}`,
    `Peso ${vitalSigns.weight}`,
    `TPC ${vitalSigns.capillaryRefill}`,
  ];

  return [...values, vitalSigns.notes ? `Obs: ${vitalSigns.notes}` : ""].filter(Boolean).join(" · ");
};

const getInitialRecordState = (patientRecord?: { chiefComplaint?: string; anamnesis?: string; physicalExam?: string; vitalSigns?: string; diagnosis?: string; conduct?: string; } | null) => ({
  chiefComplaint: patientRecord?.chiefComplaint ?? "",
  anamnesis: patientRecord?.anamnesis ?? "",
  physicalExam: patientRecord?.physicalExam ?? "",
  vitalSigns: parseVitalSigns(patientRecord?.vitalSigns),
  diagnosis: patientRecord?.diagnosis ?? "",
  conduct: patientRecord?.conduct ?? "",
  prescription: "",
  exam: "",
  document: "",
});

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { appointments, patients, addToast, startAppointment, pauseAppointment, finishAppointment, updateClinicalRecord, addPrescription, addExam, addDocument, clinicalRecords } = useApp();

  const appointment = useMemo(() => appointments.find((item) => item.id === params.id), [appointments, params.id]);
  const patient = useMemo(() => patients.find((item) => item.id === appointment?.patientId), [appointment?.patientId, patients]);
  const patientRecord = useMemo(() => clinicalRecords.find((item) => item.patientId === patient?.id && item.appointmentId === appointment?.id), [appointment?.id, clinicalRecords, patient?.id]);
  const [selectedStep, setSelectedStep] = useState<string>("Anamnese");
  const [recordState, setRecordState] = useState(() => getInitialRecordState(patientRecord));

  if (!appointment || !patient) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-xl font-semibold text-slate-900">Atendimento não encontrado</div>
          <Link href="/atendimentos" className="mt-4 inline-flex rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white">Voltar para atendimentos</Link>
        </div>
      </div>
    );
  }

  const handleSaveRecord = () => {
    const nextVitalSigns = formatVitalSigns(recordState.vitalSigns);
    updateClinicalRecord({
      patientId: patient.id,
      appointmentId: appointment.id,
      tenantId: "tenant-demo",
      veterinarianId: "vet-ana",
      chiefComplaint: recordState.chiefComplaint || patientRecord?.chiefComplaint || "",
      anamnesis: recordState.anamnesis || patientRecord?.anamnesis || "",
      physicalExam: recordState.physicalExam || patientRecord?.physicalExam || "",
      vitalSigns: nextVitalSigns,
      diagnosis: recordState.diagnosis || patientRecord?.diagnosis || "",
      conduct: recordState.conduct || patientRecord?.conduct || "",
    });

    setRecordState((prev) => ({
      ...prev,
      vitalSigns: parseVitalSigns(nextVitalSigns),
    }));

    addToast("Registro atualizado", "As informações clínicas do atendimento foram salvas.", "success");
  };

  const handleFinish = () => {
    finishAppointment(appointment.id);
    addToast("Atendimento finalizado", "O atendimento foi concluído e salvo em prontuário.", "success");
    router.push(`/pacientes/${patient.id}/prontuario`);
  };

  const renderForm = () => {
    if (selectedStep === "Paciente") {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Paciente</div>
          <div className="mt-2">{patient.name} · {patient.specie} · {patient.breed}</div>
          <div className="mt-1">Tutor: {patient.owner}</div>
          <div className="mt-1">Pesagem: {patient.weight}</div>
        </div>
      );
    }

    if (selectedStep === "Anamnese") {
      return (
        <div className="space-y-4">
          <label className="block text-sm text-slate-600">
            <span>Queixa principal</span>
            <textarea
              value={recordState.chiefComplaint}
              onChange={(event) => setRecordState((prev) => ({ ...prev, chiefComplaint: event.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none"
              placeholder="Descreva a principal queixa do tutor e do paciente..."
            />
          </label>

          <label className="block text-sm text-slate-600">
            <span>Anamnese</span>
            <textarea
              value={recordState.anamnesis}
              onChange={(event) => setRecordState((prev) => ({ ...prev, anamnesis: event.target.value }))}
              rows={6}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none"
              placeholder="Anamnese: histórico, alimentação, medicamentos, sinais e evolução..."
            />
          </label>

          <button type="button" onClick={handleSaveRecord} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar anamnese</button>
        </div>
      );
    }

    if (selectedStep === "Exame físico") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.physicalExam} onChange={(event) => setRecordState((prev) => ({ ...prev, physicalExam: event.target.value }))} rows={6} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Exame físico: inspeção, palpação, condição corporal e achados..." />
          <button type="button" onClick={handleSaveRecord} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar exame físico</button>
        </div>
      );
    }

    if (selectedStep === "Sinais vitais") {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { key: "temperature", label: "Temperatura", unit: "°C" },
              { key: "heartRate", label: "FC", unit: "bpm" },
              { key: "respiratoryRate", label: "FR", unit: "rpm" },
              { key: "systolic", label: "PAS", unit: "mmHg" },
              { key: "diastolic", label: "PAD", unit: "mmHg" },
              { key: "spo2", label: "SpO2", unit: "%" },
              { key: "weight", label: "Peso", unit: "kg" },
              { key: "capillaryRefill", label: "TPC", unit: "s" },
            ].map(({ key, label, unit }) => (
              <label key={key} className="block rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={recordState.vitalSigns[key as keyof typeof defaultVitalSigns]}
                    onChange={(event) => setRecordState((prev) => ({
                      ...prev,
                      vitalSigns: {
                        ...prev.vitalSigns,
                        [key]: event.target.value,
                      },
                    }))}
                    className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
                    placeholder={label}
                  />
                  <span className="text-xs text-slate-500">{unit}</span>
                </div>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Observações</span>
            <textarea
              value={recordState.vitalSigns.notes}
              onChange={(event) => setRecordState((prev) => ({
                ...prev,
                vitalSigns: {
                  ...prev.vitalSigns,
                  notes: event.target.value,
                },
              }))}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none"
              placeholder="Registrar observações complementares dos sinais vitais..."
            />
          </label>

          <button type="button" onClick={handleSaveRecord} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar sinais vitais</button>
        </div>
      );
    }

    if (selectedStep === "Diagnóstico") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.diagnosis} onChange={(event) => setRecordState((prev) => ({ ...prev, diagnosis: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Diagnóstico principal e diferenciais..." />
          <button type="button" onClick={handleSaveRecord} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar diagnóstico</button>
        </div>
      );
    }

    if (selectedStep === "Conduta") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.conduct} onChange={(event) => setRecordState((prev) => ({ ...prev, conduct: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Conduta, orientações, monitoramento e próximos passos..." />
          <button type="button" onClick={handleSaveRecord} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar conduta</button>
        </div>
      );
    }

    if (selectedStep === "Prescrição") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.prescription} onChange={(event) => setRecordState((prev) => ({ ...prev, prescription: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Medicamentos, doses, frequência e orientações..." />
          <button type="button" onClick={() => {
            addPrescription({
              id: `rx-${Date.now()}`,
              organizationId: patient.organizationId ?? "org-demo",
              patientId: patient.id,
              appointmentId: appointment.id,
              clinicalRecordId: patientRecord?.id,
              doctor: appointment.doctor,
              date: new Date().toLocaleDateString("pt-BR"),
              items: [{
                id: `rx-item-${Date.now()}`,
                name: recordState.prescription || "Medicamento",
                active: recordState.prescription || "Medicamento",
                dose: "1x ao dia",
                route: "Oral",
                frequency: "12/12 h",
                duration: "5 dias",
                quantity: "10 comprimidos",
                notes: "Orientações conforme avaliação",
              }],
            });
            addToast("Prescrição criada", "A receita foi adicionada ao prontuário do paciente.", "success");
          }} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar prescrição</button>
        </div>
      );
    }

    if (selectedStep === "Exames") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.exam} onChange={(event) => setRecordState((prev) => ({ ...prev, exam: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Solicitar exame, laboratório e observações..." />
          <button type="button" onClick={() => {
            addExam({
              id: `exam-${Date.now()}`,
              organizationId: patient.organizationId ?? "org-demo",
              patientId: patient.id,
              appointmentId: appointment.id,
              clinicalRecordId: patientRecord?.id,
              name: recordState.exam || "Exame solicitado",
              lab: "Lab VetCare",
              priority: "Média",
              status: "Solicitado",
              observations: "Solicitado durante atendimento",
            });
            addToast("Exame solicitado", "O exame foi registrado no prontuário.", "success");
          }} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Solicitar exame</button>
        </div>
      );
    }

    if (selectedStep === "Documentos") {
      return (
        <div className="space-y-3">
          <textarea value={recordState.document} onChange={(event) => setRecordState((prev) => ({ ...prev, document: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 focus:outline-none" placeholder="Anexar documentação, fotos ou consentimentos..." />
          <button type="button" onClick={() => {
            addDocument({
              id: `doc-${Date.now()}`,
              organizationId: patient.organizationId ?? "org-demo",
              patientId: patient.id,
              appointmentId: appointment.id,
              clinicalRecordId: patientRecord?.id,
              name: recordState.document || "Documento anexo",
              type: "Atendimento",
              date: new Date().toLocaleDateString("pt-BR"),
              size: "0.6 MB",
            });
            addToast("Documento anexado", "O arquivo foi registrado no prontuário.", "success");
          }} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Anexar documento</button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Finalize o atendimento e direcione para o prontuário do paciente.
        </div>
        <button type="button" onClick={handleFinish} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Finalizar atendimento</button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-6 xl:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/atendimentos" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Voltar para atendimentos
        </Link>
        <div className="flex gap-2">
          {appointment.status === "scheduled" || appointment.status === "waiting" ? (
            <button type="button" onClick={() => startAppointment(appointment.id)} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Iniciar atendimento</button>
          ) : null}
          <button type="button" onClick={() => pauseAppointment(appointment.id)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Pausar</button>
          <button type="button" onClick={handleFinish} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Finalizar atendimento</button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-500 to-teal-700 text-xl font-bold text-white">{patient.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="text-2xl font-semibold text-slate-900">{patient.name}</div>
              <div className="text-sm text-slate-500">{patient.specie} • {patient.breed} • {patient.weight}</div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <div><span className="font-medium text-slate-800">Tutor:</span> {patient.owner}</div>
            <div><span className="font-medium text-slate-800">Atendimento:</span> {appointment.type}</div>
            <div><span className="font-medium text-slate-800">Data:</span> {appointment.date} • {appointment.time}</div>
            <div><span className="font-medium text-slate-800">Veterinário:</span> {appointment.doctor}</div>
          </div>

          <div className="mt-4">
            <StatusBadge label={appointment.status === "in_progress" ? "Em andamento" : appointment.status === "finished" ? "Finalizado" : appointment.status === "paused" ? "Pausado" : "Aguardando"} tone={appointment.status === "in_progress" ? "success" : appointment.status === "finished" ? "success" : appointment.status === "paused" ? "info" : "warning"} />
          </div>

          <div className="mt-5 space-y-2">
            {clinicalSteps.map((step, index) => (
              <button key={step} type="button" onClick={() => setSelectedStep(step)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left text-sm ${selectedStep === step ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-700">{index + 1}</span>
                {step}
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            Fluxo clínico
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">{selectedStep}</h2>
          <div className="mt-5">{renderForm()}</div>

          <div className="mt-6 grid gap-3 md:grid-cols-2"> 
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><FileText className="h-4 w-4 text-emerald-700" /> Diagnóstico</div>
              <div className="mt-2 text-sm text-slate-600">{patientRecord?.diagnosis || "Ainda não registrado"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Stethoscope className="h-4 w-4 text-emerald-700" /> Conduta</div>
              <div className="mt-2 text-sm text-slate-600">{patientRecord?.conduct || "Ainda não registrado"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Syringe className="h-4 w-4 text-emerald-700" /> Prescrição</div>
              <div className="mt-2 text-sm text-slate-600">{patientRecord?.conduct ? "Registrado no prontuário" : "Ainda não registrada"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Activity className="h-4 w-4 text-emerald-700" /> Sinais vitais</div>
              <div className="mt-2 text-sm text-slate-600">{patientRecord?.vitalSigns || "Ainda não registrados"}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
