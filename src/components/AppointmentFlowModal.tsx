"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PatientForm } from "@/components/PatientForms";
import { useApp } from "@/context/AppContext";
import type { AppointmentType, AppointmentPriority } from "@/mocks/data";

export function AppointmentFlowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { patients, veterinarians, createAppointment, addToast } = useApp();
  const [search, setSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientFormOpen, setPatientFormOpen] = useState(false);
  const [draft, setDraft] = useState({
    type: "Consulta" as AppointmentType,
    veterinarianId: veterinarians[0]?.id ?? "vet-ana",
    date: "2026-08-13",
    time: "09:00",
    priority: "normal" as AppointmentPriority,
    notes: "",
  });

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return patients.slice(0, 4);
    return patients.filter((patient) =>
      `${patient.name} ${patient.owner} ${patient.specie} ${patient.breed} ${patient.ownerPhone}`
        .toLowerCase()
        .includes(query),
    );
  }, [patients, search]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0];

  const handleCreate = () => {
    if (!selectedPatient) {
      addToast("Paciente obrigatório", "Selecione um paciente antes de agendar o atendimento.", "warning");
      return;
    }

    const veterinarian = veterinarians.find((item) => item.id === draft.veterinarianId) ?? veterinarians[0];

    createAppointment({
      organizationId: selectedPatient.organizationId,
      patientId: selectedPatient.id,
      patient: selectedPatient.name,
      tutor: selectedPatient.owner,
      doctor: veterinarian?.name ?? "Dra. Amanda",
      veterinarianId: veterinarian?.id ?? "vet-ana",
      type: draft.type,
      status: "scheduled",
      priority: draft.priority,
      date: draft.date,
      time: draft.time,
      notes: draft.notes,
    });

    addToast("Atendimento criado com sucesso.", "O atendimento foi incluído na central e no prontuário do paciente.", "success");
    setSelectedPatientId("");
    setSearch("");
    setDraft({
      type: "Consulta",
      veterinarianId: veterinarians[0]?.id ?? "vet-ana",
      date: "2026-08-13",
      time: "09:00",
      priority: "normal",
      notes: "",
    });
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Novo atendimento" size="lg">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-sm font-medium text-slate-700">Selecionar paciente</div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar paciente, tutor ou espécie"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none"
            />
            <div className="mt-3 grid gap-2">
              {results.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => {
                    setSelectedPatientId(patient.id);
                    setSearch(patient.name);
                  }}
                  className={`rounded-2xl border p-3 text-left ${selectedPatientId === patient.id ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="font-medium text-slate-900">{patient.name}</div>
                  <div className="text-sm text-slate-500">{patient.specie} • {patient.breed}</div>
                  <div className="text-xs text-slate-500">Tutor: {patient.owner}</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPatientFormOpen(true)}
              className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              + Cadastrar novo paciente
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Tipo de atendimento</span>
              <select
                value={draft.type}
                onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value as AppointmentType }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              >
                <option>Consulta</option>
                <option>Retorno</option>
                <option>Vacinação</option>
                <option>Urgência</option>
                <option>Avaliação</option>
                <option>Procedimento</option>
                <option>Exame</option>
                <option>Internação</option>
                <option>Outro</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-600">
              <span>Veterinário</span>
              <select
                value={draft.veterinarianId}
                onChange={(event) => setDraft((prev) => ({ ...prev, veterinarianId: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              >
                {veterinarians.map((veterinarian) => (
                  <option key={veterinarian.id} value={veterinarian.id}>{veterinarian.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-600">
              <span>Data</span>
              <input
                type="date"
                value={draft.date}
                onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-600">
              <span>Horário</span>
              <input
                type="time"
                value={draft.time}
                onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
              <span>Prioridade</span>
              <select
                value={draft.priority}
                onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value as AppointmentPriority }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="priority">Prioridade</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
              <span>Observações</span>
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <span>Paciente selecionado</span>
            <span className="font-medium text-slate-900">{selectedPatient ? selectedPatient.name : "Nenhum paciente selecionado"}</span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">
              Criar atendimento
            </button>
          </div>
        </div>
      </Modal>

      <PatientForm open={patientFormOpen} onClose={() => setPatientFormOpen(false)} />
    </>
  );
}
