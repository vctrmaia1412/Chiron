'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Upload } from 'lucide-react';
import type { DocumentDto, DocumentKind, Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { UPLOAD_ACCEPT, openDocument, uploadDocument } from '@/lib/documents';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { PatientPicker, type PatientPickerValue } from '@/components/patients/patient-picker';
import { GenerateDocumentSheet } from '@/components/documents/generate-sheet';

const KIND_LABEL: Record<DocumentKind, string> = {
  prescription: 'Receita',
  consent: 'Termo de consentimento',
  report: 'Relatório',
  exam_result: 'Laudo de exame',
  imaging: 'Exame de imagem',
  certificate: 'Atestado',
  health_certificate: 'Atestado de saúde',
  vaccination_certificate: 'Atestado de vacinação',
  attendance_statement: 'Declaração de comparecimento',
  referral_letter: 'Encaminhamento',
  death_certificate: 'Atestado de óbito',
  medical_record: 'Prontuário',
  photo: 'Foto',
  invoice: 'Documento fiscal',
  other: 'Outro',
};

/** O que a recepção e o veterinário costumam anexar à mão. */
const UPLOAD_KINDS: DocumentKind[] = ['exam_result', 'imaging', 'photo', 'consent', 'report', 'other'];

function DocumentsView() {
  const params = useSearchParams();
  const patientId = params.get('pacienteId') ?? undefined;
  const { can } = useSession();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents', patientId],
    queryFn: () => api.get<{ items: DocumentDto[] }>('/documents', { patientId, limit: 60 }),
  });

  // Vindo da ficha: a lista é de um paciente só, e o caminho de volta é a ficha.
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get<Patient>(`/patients/${patientId}`),
    enabled: Boolean(patientId),
  });

  async function download(documentId: string) {
    try {
      await openDocument(documentId);
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={patient ? `Documentos de ${patient.name}` : 'Documentos'}
        description="Arquivos e documentos gerados. Nada é guardado no navegador: o download usa link assinado de curta duração."
        back={patientId ? { href: `/pacientes/${patientId}`, label: patient?.name ?? 'Ficha do paciente' } : undefined}
        actions={
          <>
            {can('document:generate') && (
              <Button variant="secondary" size="sm" onClick={() => setGenerateOpen(true)}>
                <FileText className="h-4 w-4" />
                Gerar documento
              </Button>
            )}
            {can('document:create') && (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" />
                Enviar arquivo
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader title={patientId ? 'Documentos do paciente' : 'Todos os documentos'} />
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title="Nenhum documento"
            description="Receitas assinadas e documentos gerados aparecem aqui automaticamente."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((document) => (
              <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-medium text-[var(--ink)]">{document.title}</p>
                  <p className="truncate text-[12.5px] text-[var(--ink-3)]">
                    {[
                      KIND_LABEL[document.kind as DocumentKind] ?? document.kind,
                      formatDateTime(document.createdAt),
                      document.uploadedByName,
                      `${Math.max(1, Math.round(document.sizeBytes / 1024))} KB`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {document.virusScanStatus === 'infected' && <Badge tone="danger">Bloqueado</Badge>}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void download(document.id)}
                  disabled={document.status !== 'active'}
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <UploadSheet open={uploadOpen} onOpenChange={setUploadOpen} presetPatientId={patientId} />
      <GenerateDocumentSheet open={generateOpen} onOpenChange={setGenerateOpen} presetPatientId={patientId} />
    </>
  );
}

function UploadSheet({
  open,
  onOpenChange,
  presetPatientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetPatientId?: string;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocumentKind>('exam_result');
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const targetId = presetPatientId ?? patient?.id;
      if (!targetId) throw new Error('Escolha o paciente.');
      if (!file) throw new Error('Selecione o arquivo.');

      return uploadDocument(file, {
        kind,
        title: title.trim() || file.name,
        links: [{ targetType: 'patient', targetId }],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Arquivo enviado.');
      setFile(null);
      setTitle('');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar arquivo"
      description="PDF, JPEG, PNG ou WebP, até 25 MB."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!presetPatientId && <PatientPicker value={patient} onChange={setPatient} />}

        <Field label="Tipo">
          <Select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
            {UPLOAD_KINDS.map((value) => (
              <option key={value} value={value}>
                {KIND_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={file?.name ?? 'Nome do documento'}
          />
        </Field>

        <Field label="Arquivo" required>
          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] px-3 py-3 text-[13.5px] text-[var(--ink-2)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[var(--brand-ink)]"
          />
        </Field>

        <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          O conteúdo enviado é conferido contra o tipo declarado antes de ficar disponível.
        </p>
      </div>
    </Sheet>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <DocumentsView />
    </Suspense>
  );
}
