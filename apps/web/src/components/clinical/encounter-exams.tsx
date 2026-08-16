'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Plus } from 'lucide-react';
import type { ExamOrder } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useExamCatalog } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/field';
import { ExamOrderCard } from '@/components/lab/exam-order-card';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

export function EncounterExams({
  encounterId,
  patientId,
  writable,
}: {
  encounterId: string;
  patientId: string;
  writable: boolean;
}) {
  const { can } = useSession();
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['exam-orders', encounterId],
    queryFn: () => api.get<{ items: ExamOrder[] }>('/exam-orders', { encounterId, limit: 30 }),
  });

  const items = data?.items ?? [];

  return (
    <>
      <Card>
        <CardHeader
          title="Exames"
          action={
            writable && can('exam_order:create') ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Solicitar
              </Button>
            ) : undefined
          }
        />
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="h-7 w-7" />}
            title="Nenhum exame solicitado"
            description="Os pedidos ficam vinculados a este atendimento e ao prontuário do paciente."
            action={
              writable && can('exam_order:create') ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Solicitar exame
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3 px-4 py-4">
            {items.map((order) => (
              <ExamOrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </Card>

      <ExamOrderSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        encounterId={encounterId}
        patientId={patientId}
      />
    </>
  );
}

function ExamOrderSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const { data: catalog = [] } = useExamCatalog(open);
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [clinicalInfo, setClinicalInfo] = useState('');
  const [laboratoryId, setLaboratoryId] = useState('');

  const { data: laboratories } = useQuery({
    queryKey: ['laboratories'],
    queryFn: () => api.get<{ items: Array<{ id: string; name: string; isInternal: boolean }> }>('/exam-orders/laboratories'),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ExamOrder>('/exam-orders', {
        patientId,
        encounterId,
        priority,
        clinicalInfo: clinicalInfo.trim() || undefined,
        laboratoryId: laboratoryId || undefined,
        items: selected.map((examCatalogId) => ({ examCatalogId })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Exame solicitado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const grouped = catalog.reduce<Record<string, typeof catalog>>((acc, exam) => {
    (acc[exam.category] ??= []).push(exam);
    return acc;
  }, {});

  const CATEGORY_LABEL: Record<string, string> = {
    hematology: 'Hematologia',
    biochemistry: 'Bioquímica',
    imaging: 'Imagem',
    cytology: 'Citologia e histopatologia',
    microbiology: 'Microbiologia',
    urinalysis: 'Urinálise',
    parasitology: 'Parasitologia',
    other: 'Outros',
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Solicitar exames"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (selected.length === 0) {
                toast.error('Selecione ao menos um exame.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Solicitar {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prioridade">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              <option value="routine">Rotina</option>
              <option value="urgent">Urgente</option>
              <option value="stat">Imediato</option>
            </Select>
          </Field>
          <Field label="Laboratório">
            <Select value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)}>
              <option value="">Definir depois</option>
              {(laboratories?.items ?? []).map((laboratory) => (
                <option key={laboratory.id} value={laboratory.id}>
                  {laboratory.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Informação clínica" hint="Ajuda o laboratório a interpretar o material.">
          <Textarea
            value={clinicalInfo}
            onChange={(event) => setClinicalInfo(event.target.value)}
            rows={2}
            placeholder="Suspeita clínica, medicações em uso, jejum."
          />
        </Field>

        <div className="space-y-3">
          {Object.entries(grouped).map(([category, exams]) => (
            <div key={category}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                {CATEGORY_LABEL[category] ?? category}
              </p>
              <div className="space-y-0.5">
                {exams.map((exam) => (
                  <Checkbox
                    key={exam.id}
                    checked={selected.includes(exam.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, exam.id] : current.filter((id) => id !== exam.id),
                      )
                    }
                    label={
                      <span>
                        <span className="text-[14px] text-[var(--ink)]">{exam.name}</span>
                        {exam.specimenKind && (
                          <span className="block text-[12px] text-[var(--ink-3)]">{exam.specimenKind}</span>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function ExamOrderSheet(props: React.ComponentProps<typeof ExamOrderSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <ExamOrderSheetContent {...props} />
    </MountWhenOpen>
  );
}
