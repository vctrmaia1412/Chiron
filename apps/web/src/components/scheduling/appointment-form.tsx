'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import type { Appointment, Patient, PatientListItem } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useProfessionals, useServices } from '@/lib/catalog';
import { formatDateTime, formatTime, toIsoDate } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PatientPicker } from '@/components/patients/patient-picker';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

function AppointmentFormSheetContent({
  open,
  onOpenChange,
  defaultDate,
  defaultPatientId,
  defaultReason,
  originEncounterId,
  appointment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultPatientId?: string;
  defaultReason?: string;
  /** Atendimento que pediu o retorno: o agendamento sai da lista de retornos. */
  originEncounterId?: string;
  /** Agendamento existente: o formulário vira "Remarcar". */
  appointment?: Appointment | null;
  onSaved?: (appointment: Appointment) => void;
}) {
  const queryClient = useQueryClient();
  const { data: services = [] } = useServices();
  const { data: professionals = [] } = useProfessionals();
  const editing = Boolean(appointment);
  const initialStart = appointment ? new Date(appointment.startAt) : null;

  const [chosenPatient, setChosenPatient] = useState<
    { id: string; name: string; guardianId?: string | null } | null
  >(null);
  const [chosenServiceId, setChosenServiceId] = useState(appointment?.service.id ?? '');
  const [professionalId, setProfessionalId] = useState(appointment?.professional?.id ?? '');
  const [date, setDate] = useState(() => toIsoDate(initialStart ?? defaultDate ?? new Date()));
  const [time, setTime] = useState(() => (initialStart ? formatTime(appointment!.startAt) : '09:00'));
  const [reason, setReason] = useState(appointment?.reason ?? defaultReason ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: preset } = useQuery({
    queryKey: ['patient', defaultPatientId],
    queryFn: () => api.get<Patient>(`/patients/${defaultPatientId}`),
    enabled: Boolean(defaultPatientId) && !editing,
  });

  // Paciente vindo por parâmetro é derivado da consulta, não copiado para o
  // estado: evita o descompasso entre o que chegou e o que está na tela.
  const patient = useMemo(() => {
    if (appointment) {
      return appointment.patient
        ? { id: appointment.patient.id, name: appointment.patient.name, guardianId: appointment.guardian?.id ?? null }
        : null;
    }
    if (chosenPatient) return chosenPatient;
    if (!preset) return null;
    const primary = preset.guardians.find((g) => g.isPrimary) ?? preset.guardians[0];
    return { id: preset.id, name: preset.name, guardianId: primary?.guardianId ?? null };
  }, [appointment, chosenPatient, preset]);

  // Consulta é o serviço mais frequente: entra pré-selecionado assim que o
  // catálogo carrega, sem efeito copiando valor para o estado.
  const serviceId =
    chosenServiceId || services.find((service) => service.key === 'consulta')?.id || services[0]?.id || '';
  const selectedService = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const startAt = new Date(`${date}T${time}:00`).toISOString();
      if (appointment) {
        return api.patch<Appointment>(`/appointments/${appointment.id}`, {
          professionalId: professionalId || null,
          serviceId,
          startAt,
          reason: reason.trim() || null,
          notes: notes.trim() || null,
          allowOverlap,
          expectedVersion: appointment.version,
        });
      }
      return api.post<Appointment>('/appointments', {
        patientId: patient?.id,
        guardianId: patient?.guardianId ?? undefined,
        professionalId: professionalId || undefined,
        serviceId,
        startAt,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        originEncounterId,
        allowOverlap,
      });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (originEncounterId) await queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      toast.success(editing ? 'Agendamento remarcado.' : 'Agendamento criado.');
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        setConflict(error.message);
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!patient && !editing) next.patient = 'Escolha o paciente.';
    if (!serviceId) next.serviceId = 'Escolha o serviço.';
    if (!date) next.date = 'Informe a data.';
    if (!time) next.time = 'Informe o horário.';
    if (selectedService?.requiresProfessional && !professionalId) {
      next.professionalId = 'Este serviço exige um profissional.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Remarcar' : originEncounterId ? 'Agendar retorno' : 'Novo agendamento'}
      description={appointment ? `Hoje: ${formatDateTime(appointment.startAt)}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setConflict(null);
              if (validate()) mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            {editing ? 'Salvar novo horário' : 'Agendar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? (
          <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[12px] text-[var(--ink-3)]">Paciente</p>
            <p className="text-[14.5px] font-medium text-[var(--ink)]">
              {patient?.name ?? appointment?.guardian?.name ?? 'Sem paciente'}
            </p>
          </div>
        ) : (
          <PatientPicker value={patient} onChange={setChosenPatient} error={errors.patient} />
        )}

        <Field label="Serviço" required error={errors.serviceId}>
          <Select value={serviceId} onChange={(event) => setChosenServiceId(event.target.value)}>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} ({service.defaultDurationMin} min)
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Profissional"
          required={selectedService?.requiresProfessional}
          error={errors.professionalId}
        >
          <Select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Sem profissional definido</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
                {professional.councilNumber ? ` (${professional.councilNumber})` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" required error={errors.date}>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Horário" required error={errors.time}>
            <Input type="time" step={300} value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>

        <Field label="Motivo" hint="Aparece na fila de atendimento e vira a queixa inicial.">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: vômito há dois dias"
          />
        </Field>

        <Field label="Observações internas">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </Field>

        {conflict && (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-3">
            <p className="flex items-start gap-2 text-[13.5px] font-medium text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {conflict}
            </p>
            <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={allowOverlap}
                onChange={(event) => setAllowOverlap(event.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Agendar mesmo assim (encaixe)
            </label>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Seletor de paciente com busca no servidor, irmão do seletor de tutor. */
export function usePatientSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ['patients', 'picker', term],
    queryFn: () => api.get<{ items: PatientListItem[] }>('/patients', { q: term, limit: 8, status: 'active' }),
    enabled: enabled && term.length >= 2,
    staleTime: 15_000,
  });
}

export function AppointmentFormSheet(props: React.ComponentProps<typeof AppointmentFormSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <AppointmentFormSheetContent {...props} />
    </MountWhenOpen>
  );
}
