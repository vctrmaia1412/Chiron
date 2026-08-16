'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EncounterDetail } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useProfessionals, useServices } from '@/lib/catalog';

import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { PatientPicker, type PatientPickerValue } from '@/components/patients/patient-picker';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

/** Atendimento sem agendamento prévio: walk-in e urgência. */
function WalkInSheetContent({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (encounterId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: services = [] } = useServices();
  const { data: professionals = [] } = useProfessionals();

  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [encounterClass, setEncounterClass] = useState<'outpatient' | 'emergency' | 'field' | 'telehealth'>('outpatient');
  const [professionalId, setProfessionalId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () =>
      api.post<EncounterDetail>('/encounters', {
        patientId: patient?.id,
        serviceId: serviceId || undefined,
        class: encounterClass,
        attendingProfessionalId: professionalId || undefined,
        chiefComplaint: chiefComplaint.trim() || undefined,
      }),
    onSuccess: async (encounter) => {
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Atendimento aberto.');
      onOpenChange(false);
      onCreated?.(encounter.id);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Atendimento sem agenda"
      description="Para walk-in, urgência e atendimento a campo."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!patient) {
                setErrors({ patient: 'Escolha o paciente.' });
                return;
              }
              setErrors({});
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Abrir atendimento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />

        <Field label="Tipo de atendimento">
          <Select
            value={encounterClass}
            onChange={(event) => setEncounterClass(event.target.value as typeof encounterClass)}
          >
            <option value="outpatient">Ambulatorial</option>
            <option value="emergency">Urgência</option>
            <option value="field">Campo</option>
            <option value="telehealth">Teleatendimento</option>
          </Select>
        </Field>

        <Field label="Serviço">
          <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">Não definido</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Profissional responsável">
          <Select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Definir depois</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Queixa principal">
          <Input
            value={chiefComplaint}
            onChange={(event) => setChiefComplaint(event.target.value)}
            placeholder="Motivo da vinda"
          />
        </Field>
      </div>
    </Sheet>
  );
}

export function WalkInSheet(props: React.ComponentProps<typeof WalkInSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <WalkInSheetContent {...props} />
    </MountWhenOpen>
  );
}
