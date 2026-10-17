'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileSignature, Pill, Plus, Repeat, XCircle } from 'lucide-react';
import type { Prescription, PrescriptionItemInput } from '@chiron/contracts';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { usePrescriptionTemplates } from '@/lib/charting';
import { formatDateShort } from '@/lib/format';
import { Card, CardHeader, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/sheet';
import { PrescriptionBlock } from './clinical-blocks';
import { PrescriptionFormSheet } from './prescription-form';

export function EncounterPrescriptions({
  encounterId,
  patientId,
  patientName,
  weightKg,
  writable,
  speciesId = null,
  formOpen: controlledOpen,
  onFormOpenChange,
}: {
  encounterId: string;
  patientId: string;
  patientName: string;
  weightKg: string | null;
  writable: boolean;
  speciesId?: string | null;
  /** Aberto de fora, pela barra de ações do celular. */
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [internalOpen, setInternalOpen] = useState(false);
  const formOpen = controlledOpen ?? internalOpen;
  const [prefill, setPrefill] = useState<{ title: string; items: Array<PrescriptionItemInput> } | null>(null);
  function setFormOpen(next: boolean) {
    if (!next) setPrefill(null);
    (onFormOpenChange ?? setInternalOpen)(next);
  }
  function openWith(title: string, items: Array<PrescriptionItemInput>) {
    setPrefill({ title, items });
    (onFormOpenChange ?? setInternalOpen)(true);
  }
  const [signTarget, setSignTarget] = useState<Prescription | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Prescription | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['prescriptions', encounterId],
    queryFn: () => api.get<{ items: Prescription[] }>('/prescriptions', { encounterId, limit: 50 }),
  });

  const canCreate = writable && can('prescription:create');

  // Última receita assinada de outro atendimento: "repetir" é o caso mais
  // comum em retorno e em doença crônica, e vira um toque.
  const { data: history } = useQuery({
    queryKey: ['prescriptions', 'patient', patientId],
    queryFn: () => api.get<{ items: Prescription[] }>('/prescriptions', { patientId, limit: 10 }),
    enabled: canCreate,
    staleTime: 60_000,
  });
  const lastPrescription = history?.items.find(
    (prescription) => prescription.status === 'signed' && prescription.encounterId !== encounterId,
  );
  const { data: templates = [] } = usePrescriptionTemplates(speciesId, canCreate);

  function itemsOf(prescription: Prescription): PrescriptionItemInput[] {
    return prescription.items.map((item) => ({
      drugName: item.drugName,
      activeIngredient: item.activeIngredient ?? undefined,
      concentration: item.concentration ?? undefined,
      doseValue: item.doseValue ? Number(item.doseValue) : undefined,
      doseUom: item.doseUom ?? undefined,
      dosePerKg: item.dosePerKg,
      route: item.route ?? undefined,
      frequencyKind: item.frequencyKind ?? undefined,
      frequencyValue: item.frequencyValue ? Number(item.frequencyValue) : undefined,
      durationDays: item.durationDays ?? undefined,
      quantity: item.quantity ? Number(item.quantity) : undefined,
      quantityUom: item.quantityUom ?? undefined,
      instructions: item.instructions ?? undefined,
      isControlled: item.isControlled,
      withdrawalMeatDays: item.withdrawalMeatDays ?? undefined,
      withdrawalMilkDays: item.withdrawalMilkDays ?? undefined,
      extraLabel: item.extraLabel,
    }));
  }

  const shortcuts =
    canCreate && (lastPrescription || templates.length > 0) ? (
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-4 py-3">
        {lastPrescription && (
          <button
            type="button"
            onClick={() =>
              openWith(
                `Repetir receita de ${formatDateShort(lastPrescription.signedAt ?? lastPrescription.createdAt)}`,
                itemsOf(lastPrescription),
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--brand)]/40 bg-[var(--brand-soft)] px-3 text-[13px] font-medium text-[var(--brand-ink)]"
          >
            <Repeat className="h-3.5 w-3.5" />
            Repetir última ({lastPrescription.items.map((item) => item.drugName).slice(0, 2).join(', ')}
            {lastPrescription.items.length > 2 ? '…' : ''})
          </button>
        )}
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => openWith(template.name, template.items)}
            className="inline-flex h-9 items-center rounded-full border border-[var(--border-strong)] px-3 text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            {template.name}
          </button>
        ))}
      </div>
    ) : null;

  const signMutation = useMutation({
    mutationFn: (id: string) => api.post<Prescription>(`/prescriptions/${id}/sign`, { allergiesReviewed: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prescriptions', encounterId] });
      await queryClient.invalidateQueries({ queryKey: ['timeline', patientId] });
      toast.success('Receita assinada. O PDF ficou arquivado nos documentos.');
      setSignTarget(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/prescriptions/${id}/cancel`, { reason: cancelReason.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prescriptions', encounterId] });
      toast.success('Receita cancelada. O registro permanece no histórico.');
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  async function download(documentId: string) {
    try {
      await openSignedUrl(async () => {
        const result = await api.get<{ url: string }>(`/documents/${documentId}/download`);
        return result.url;
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <Card>
        <CardHeader
          title="Receitas"
          description={weightKg ? undefined : 'Sem peso registrado, a dose por quilo não pode ser calculada.'}
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova receita
              </Button>
            ) : undefined
          }
        />

        {shortcuts}

        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : items.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3.5 text-[13.5px] text-[var(--ink-3)]">
            <Pill className="h-4 w-4" />
            Nenhuma receita neste atendimento.
          </p>
        ) : (
          <div className="space-y-3 px-4 py-4">
            {items.map((prescription) => (
              <div key={prescription.id} className="space-y-2">
                <PrescriptionBlock prescription={prescription} />
                <div className="flex flex-wrap gap-2">
                  {prescription.status === 'draft' && can('prescription:sign') && (
                    <Button size="sm" onClick={() => setSignTarget(prescription)}>
                      <FileSignature className="h-3.5 w-3.5" />
                      Assinar
                    </Button>
                  )}
                  {prescription.documentId && (
                    <Button size="sm" variant="secondary" onClick={() => void download(prescription.documentId!)}>
                      <Download className="h-3.5 w-3.5" />
                      Baixar PDF
                    </Button>
                  )}
                  {prescription.status !== 'cancelled' && can('prescription:cancel') && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(prescription)}>
                      <XCircle className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PrescriptionFormSheet
        key={prefill?.title ?? 'nova'}
        open={formOpen}
        onOpenChange={setFormOpen}
        encounterId={encounterId}
        patientId={patientId}
        patientName={patientName}
        weightKg={weightKg}
        speciesId={speciesId}
        initialItems={prefill?.items}
        title={prefill?.title ?? 'Nova receita'}
      />

      <ConfirmSheet
        open={Boolean(signTarget)}
        onOpenChange={(next) => {
          if (!next) setSignTarget(null);
        }}
        title="Assinar receita"
        confirmLabel="Confirmar e assinar"
        loading={signMutation.isPending}
        onConfirm={() => signTarget && signMutation.mutate(signTarget.id)}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Ao assinar, você confirma que revisou as alergias do paciente e a posologia de cada item. A receita passa a
          ser imutável e o PDF é gerado e arquivado.
        </p>
      </ConfirmSheet>

      <ConfirmSheet
        open={Boolean(cancelTarget)}
        onOpenChange={(next) => {
          if (!next) setCancelTarget(null);
        }}
        title="Cancelar receita"
        confirmLabel="Cancelar receita"
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelReason.trim().length < 3) {
            toast.error('Informe o motivo do cancelamento.');
            return;
          }
          if (cancelTarget) cancelMutation.mutate(cancelTarget.id);
        }}
      >
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-2)]">
            A receita não é apagada: fica marcada como cancelada, com o motivo e o autor.
          </p>
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={3}
            placeholder="Motivo do cancelamento"
            className="w-full rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-2 text-[14px]"
          />
        </div>
      </ConfirmSheet>
    </>
  );
}
