'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Upload } from 'lucide-react';
import type { DocumentDto } from '@chiron/contracts';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { PatientPicker, type PatientPickerValue } from '@/components/patients/patient-picker';
import { GenerateDocumentSheet } from '@/components/documents/generate-sheet';

const KIND_LABEL: Record<string, string> = {
  prescription: 'Receita',
  health_certificate: 'Atestado de saúde',
  vaccination_certificate: 'Atestado de vacinação',
  attendance_statement: 'Declaração de comparecimento',
  referral_letter: 'Encaminhamento',
  death_certificate: 'Atestado de óbito',
  consent: 'Termo de consentimento',
  exam_report: 'Laudo de exame',
  image: 'Imagem',
  medical_record: 'Prontuário',
  invoice: 'Documento fiscal',
  other: 'Outro',
};

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

  async function download(documentId: string) {
    try {
      await openSignedUrl(async () => {
        const result = await api.get<{ url: string }>(`/documents/${documentId}/download`);
        return result.url;
      });
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Arquivos e documentos gerados. Nada é guardado no navegador: o download usa link assinado de curta duração."
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
                      KIND_LABEL[document.kind] ?? document.kind,
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
  const [kind, setKind] = useState('exam_report');
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const targetId = presetPatientId ?? patient?.id;
      if (!targetId) throw new Error('Escolha o paciente.');
      if (!file) throw new Error('Selecione o arquivo.');

      // Passo 1: o servidor registra o documento e devolve uma URL assinada.
      const created = await api.post<{
        documentId: string;
        uploadUrl: string;
        method: 'PUT' | 'POST';
        headers: Record<string, string>;
      }>('/documents/uploads', {
        kind,
        title: title.trim() || file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        links: [{ targetType: 'patient', targetId }],
      });

      // Passo 2: o navegador envia direto ao armazenamento.
      const upload = await fetch(created.uploadUrl, {
        method: created.method,
        headers: created.headers,
        body: file,
      });
      if (!upload.ok) throw new Error('Falha ao enviar o arquivo para o armazenamento.');

      // Passo 3: o servidor confere os bytes contra o tipo declarado.
      await api.post(`/documents/${created.documentId}/complete`, {});
      return created.documentId;
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
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="exam_report">Laudo de exame</option>
            <option value="image">Imagem</option>
            <option value="consent">Termo de consentimento</option>
            <option value="other">Outro</option>
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
            accept="application/pdf,image/jpeg,image/png,image/webp"
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
