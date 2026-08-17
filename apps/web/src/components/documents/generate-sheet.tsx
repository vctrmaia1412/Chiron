'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PatientPicker, type PatientPickerValue } from '@/components/patients/patient-picker';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

interface TemplateDefinition {
  key: string;
  label: string;
  fields: Array<{ name: string; label: string; type?: 'text' | 'textarea' | 'date' }>;
}

const TEMPLATES: TemplateDefinition[] = [
  {
    key: 'health_certificate',
    label: 'Atestado de saúde',
    fields: [
      { name: 'condition', label: 'Condição clínica' },
      { name: 'purpose', label: 'Finalidade' },
      { name: 'observations', label: 'Observações', type: 'textarea' },
    ],
  },
  { key: 'vaccination_card', label: 'Carteira de vacinação', fields: [] },
  {
    key: 'vaccination_certificate',
    label: 'Atestado de vacinação',
    fields: [{ name: 'observations', label: 'Observações', type: 'textarea' }],
  },
  {
    key: 'attendance_statement',
    label: 'Declaração de comparecimento',
    fields: [{ name: 'period', label: 'Período' }],
  },
  {
    key: 'referral_letter',
    label: 'Carta de encaminhamento',
    fields: [
      { name: 'to', label: 'Encaminhado para' },
      { name: 'reason', label: 'Motivo' },
      { name: 'summary', label: 'Resumo clínico', type: 'textarea' },
    ],
  },
  {
    key: 'death_certificate',
    label: 'Atestado de óbito',
    fields: [
      { name: 'occurredAt', label: 'Data do óbito', type: 'date' },
      { name: 'cause', label: 'Causa provável' },
      { name: 'observations', label: 'Observações', type: 'textarea' },
    ],
  },
  { key: 'consent_treatment', label: 'Termo de consentimento para tratamento', fields: [] },
  {
    key: 'consent_surgery',
    label: 'Termo de consentimento cirúrgico',
    fields: [{ name: 'procedure', label: 'Procedimento' }],
  },
  { key: 'consent_anesthesia', label: 'Termo de consentimento anestésico', fields: [] },
  {
    key: 'consent_euthanasia',
    label: 'Termo de consentimento para eutanásia',
    fields: [{ name: 'reason', label: 'Justificativa clínica', type: 'textarea' }],
  },
  { key: 'medical_record', label: 'Prontuário completo', fields: [] },
];

function GenerateDocumentSheetContent({
  open,
  onOpenChange,
  presetPatientId,
  encounterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetPatientId?: string;
  encounterId?: string;
}) {
  const queryClient = useQueryClient();
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0]!.key);
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const template = TEMPLATES.find((item) => item.key === templateKey)!;

  const mutation = useMutation({
    mutationFn: async () => {
      const targetId = encounterId ?? presetPatientId ?? patient?.id;
      if (!targetId) throw new Error('Escolha o paciente.');
      const generated = await api.post<{ documentId: string; title: string }>('/documents/generate', {
        templateKey,
        targetType: encounterId ? 'encounter' : 'patient',
        targetId,
        fields,
      });
      const download = await api.get<{ url: string }>(`/documents/${generated.documentId}/download`);
      return download.url;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Documento gerado e arquivado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // A aba do PDF precisa nascer no próprio clique: se esperássemos a geração no
  // servidor para só então abrir, o Safari trataria como pop-up e bloquearia.
  async function generate() {
    try {
      await openSignedUrl(() => mutation.mutateAsync());
    } catch {
      // A falha já virou aviso em onError.
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Gerar documento"
      description="O PDF é gerado no servidor e fica arquivado no paciente."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => void generate()} loading={mutation.isPending} className="sm:w-auto">
            Gerar PDF
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!presetPatientId && !encounterId && <PatientPicker value={patient} onChange={setPatient} />}

        <Field label="Modelo">
          <Select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
            {TEMPLATES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        {template.fields.map((field) => (
          <Field key={field.name} label={field.label}>
            {field.type === 'textarea' ? (
              <Textarea
                value={fields[field.name] ?? ''}
                onChange={(event) => setFields((current) => ({ ...current, [field.name]: event.target.value }))}
                rows={3}
              />
            ) : (
              <Input
                type={field.type === 'date' ? 'date' : 'text'}
                value={fields[field.name] ?? ''}
                onChange={(event) => setFields((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            )}
          </Field>
        ))}

        <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          O documento sai com linha para assinatura e carimbo. O hash interno serve para conferir integridade, não
          substitui assinatura eletrônica com valor jurídico.
        </p>
      </div>
    </Sheet>
  );
}

export function GenerateDocumentSheet(props: React.ComponentProps<typeof GenerateDocumentSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <GenerateDocumentSheetContent {...props} />
    </MountWhenOpen>
  );
}
