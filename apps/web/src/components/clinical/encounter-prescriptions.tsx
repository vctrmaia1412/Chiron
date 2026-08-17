'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileSignature, Pill, Plus, XCircle } from 'lucide-react';
import type { Prescription } from '@chiron/contracts';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
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
}: {
  encounterId: string;
  patientId: string;
  patientName: string;
  weightKg: string | null;
  writable: boolean;
}) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [formOpen, setFormOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<Prescription | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Prescription | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['prescriptions', encounterId],
    queryFn: () => api.get<{ items: Prescription[] }>('/prescriptions', { encounterId, limit: 50 }),
  });

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
            writable && can('prescription:create') ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova receita
              </Button>
            ) : undefined
          }
        />

        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Pill className="h-7 w-7" />}
            title="Nenhuma receita neste atendimento"
            description="A receita calcula a dose pelo peso e confere as alergias registradas."
            action={
              writable && can('prescription:create') ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nova receita
                </Button>
              ) : undefined
            }
          />
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
        open={formOpen}
        onOpenChange={setFormOpen}
        encounterId={encounterId}
        patientId={patientId}
        patientName={patientName}
        weightKg={weightKg}
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
