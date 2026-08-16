"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useApp } from "@/context/AppContext";

type AppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  patientId?: string;
};

export function AppointmentModal({ open, onClose, patientId }: AppointmentModalProps) {
  const { addAppointment, addToast } = useApp();
  const [form, setForm] = useState<{
    patient: string;
    tutor: string;
    doctor: string;
    date: string;
    time: string;
    type: "Consulta" | "Retorno" | "Vacinação" | "Exame" | "Cirurgia" | "Outro";
    status: "Agendado" | "Confirmado" | "Em atendimento" | "Concluído" | "Cancelado" | "Pendente";
    notes: string;
  }>({
    patient: patientId ?? "Thor",
    tutor: "João Silva",
    doctor: "Dra. Amanda",
    date: "2026-08-13",
    time: "09:00",
    type: "Consulta",
    status: "Agendado",
    notes: "",
  });

  const handleSubmit = () => {
    addAppointment({
      organizationId: "org-demo",
      patient: form.patient,
      tutor: form.tutor,
      doctor: form.doctor,
      date: form.date,
      time: form.time,
      type: form.type,
      status: form.status,
      notes: form.notes,
    });
    addToast("Agendamento criado", "Consulta adicionada à agenda.", "success");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo agendamento" size="md">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
          <span>Paciente</span>
          <input value={form.patient} onChange={(event) => setForm((prev) => ({ ...prev, patient: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Tutor</span>
          <input value={form.tutor} onChange={(event) => setForm((prev) => ({ ...prev, tutor: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Veterinário</span>
          <input value={form.doctor} onChange={(event) => setForm((prev) => ({ ...prev, doctor: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Data</span>
          <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Horário</span>
          <input type="time" value={form.time} onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Tipo</span>
          <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as typeof form.type }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none">
            <option>Consulta</option>
            <option>Retorno</option>
            <option>Vacinação</option>
            <option>Exame</option>
            <option>Cirurgia</option>
            <option>Outro</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Status</span>
          <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as "Agendado" | "Confirmado" | "Em atendimento" | "Concluído" | "Cancelado" | "Pendente" }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none">
            <option>Agendado</option>
            <option>Confirmado</option>
            <option>Em atendimento</option>
            <option>Concluído</option>
            <option>Cancelado</option>
            <option>Pendente</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
          <span>Observação</span>
          <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Cancelar</button>
        <button type="button" onClick={handleSubmit} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar</button>
      </div>
    </Modal>
  );
}
