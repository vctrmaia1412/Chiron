"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Modal } from "@/components/ui/Modal";

type PatientFormProps = {
  open: boolean;
  onClose: () => void;
  initialData?: {
    id?: string;
    name?: string;
    specie?: string;
    breed?: string;
    sex?: string;
    age?: string;
    weight?: string;
    owner?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    notes?: string[];
  };
};

export function PatientForm({ open, onClose, initialData }: PatientFormProps) {
  const { addPatient, updatePatient, addToast } = useApp();
  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    specie: initialData?.specie ?? "Cão",
    breed: initialData?.breed ?? "",
    sex: initialData?.sex ?? "Macho",
    age: initialData?.age ?? "",
    weight: initialData?.weight ?? "",
    owner: initialData?.owner ?? "",
    ownerPhone: initialData?.ownerPhone ?? "",
    ownerEmail: initialData?.ownerEmail ?? "",
    notes: initialData?.notes?.join("; ") ?? "",
  });

  const isEdit = useMemo(() => Boolean(initialData?.id), [initialData?.id]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (isEdit && initialData?.id) {
      updatePatient(initialData.id, {
        name: form.name,
        specie: form.specie,
        breed: form.breed,
        sex: form.sex,
        age: form.age,
        weight: form.weight,
        owner: form.owner,
        ownerPhone: form.ownerPhone,
        ownerEmail: form.ownerEmail,
        notes: form.notes ? form.notes.split("; ").filter(Boolean) : ["Paciente atualizado"],
      });
      addToast("Paciente atualizado", "Os dados do paciente foram salvos.", "success");
    } else {
      addPatient({
        organizationId: "org-demo",
        name: form.name,
        specie: form.specie,
        breed: form.breed,
        sex: form.sex,
        age: form.age,
        weight: form.weight,
        owner: form.owner,
        ownerPhone: form.ownerPhone,
        ownerEmail: form.ownerEmail,
        notes: form.notes ? form.notes.split("; ").filter(Boolean) : ["Paciente recém-cadastrado"],
        status: "Ativo",
      });
      addToast("Paciente criado", "Paciente adicionado com sucesso.", "success");
    }

    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Editar paciente" : "Novo paciente"} size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-600">
          <span>Nome</span>
          <input value={form.name} onChange={(e) => handleChange("name", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Espécie</span>
          <input value={form.specie} onChange={(e) => handleChange("specie", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Raça</span>
          <input value={form.breed} onChange={(e) => handleChange("breed", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Sexo</span>
          <select value={form.sex} onChange={(e) => handleChange("sex", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none">
            <option>Macho</option>
            <option>Fêmea</option>
            <option>Indefinido</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Data de nascimento</span>
          <input value={form.age} onChange={(e) => handleChange("age", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Peso</span>
          <input value={form.weight} onChange={(e) => handleChange("weight", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
          <span>Tutor</span>
          <input value={form.owner} onChange={(e) => handleChange("owner", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Telefone</span>
          <input value={form.ownerPhone} onChange={(e) => handleChange("ownerPhone", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600">
          <span>Email</span>
          <input value={form.ownerEmail} onChange={(e) => handleChange("ownerEmail", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
        <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
          <span>Observações</span>
          <textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:outline-none" />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Cancelar</button>
        <button type="button" onClick={handleSubmit} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Salvar paciente</button>
      </div>
    </Modal>
  );
}
