'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Download, Pencil, Phone, RotateCcw, ShieldOff } from 'lucide-react';
import type { Guardian, PatientListItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatPhone, whatsappLink } from '@/lib/format';
import { PATIENT_STATUS, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import {
  Badge,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/sheet';
import { GuardianFormSheet } from '@/components/guardians/guardian-form';
import { PatientFormSheet } from '@/components/patients/patient-form';
import { InactivateSheet, type InactivationReason } from '@/components/registry/inactivate-sheet';
import { useStepUp } from '@/components/auth/step-up';

const GUARDIAN_REASONS: InactivationReason[] = [
  { label: 'Não é mais cliente' },
  { label: 'Mudou de cidade' },
  { label: 'Cadastro duplicado' },
];

export default function GuardianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { can } = useSession();
  const stepUp = useStepUp();

  const [editOpen, setEditOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [inactivateOpen, setInactivateOpen] = useState(false);

  // A API devolve o tutor atualizado: a ficha troca na hora e as listas recarregam.
  function applyGuardian(updated: Guardian) {
    queryClient.setQueryData(['guardian', id], updated);
    void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    void queryClient.invalidateQueries({ queryKey: ['patient'] });
  }

  const inactivate = useMutation({
    mutationFn: (input: { reason: string }) =>
      api.post<Guardian>(`/guardians/${id}/inactivate`, { reason: input.reason }),
    onSuccess: (updated) => {
      applyGuardian(updated);
      setInactivateOpen(false);
      toast.success('Tutor inativado. Os pacientes continuam vinculados a ele.');
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  const reactivate = useMutation({
    mutationFn: () => api.post<Guardian>(`/guardians/${id}/reactivate`),
    onSuccess: (updated) => {
      applyGuardian(updated);
      toast.success('Tutor reativado.');
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  const { data: guardian, isLoading, error, refetch } = useQuery({
    queryKey: ['guardian', id],
    queryFn: () => api.get<Guardian>(`/guardians/${id}`),
  });

  const { data: patients } = useQuery({
    queryKey: ['patients', 'by-guardian', id],
    queryFn: () => api.get<{ items: PatientListItem[] }>('/patients', { guardianId: id, limit: 50 }),
  });

  const anonymize = useMutation({
    mutationFn: () =>
      stepUp.run(() => api.post(`/guardians/${id}/anonymize`, { confirm: true })),
    onSuccess: async (done) => {
      if (!done) return;
      await queryClient.invalidateQueries({ queryKey: ['guardian', id] });
      toast.success('Dados pessoais anonimizados. O histórico clínico dos pacientes permanece.');
      setAnonymizeOpen(false);
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  async function exportData() {
    try {
      const data = await api.get<unknown>(`/guardians/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dados-tutor-${id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Exportação gerada. O acesso ficou registrado no log.');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (isLoading || !guardian) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const wa = whatsappLink(guardian.phonePrimary);
  const inactive = Boolean(guardian.inactiveAt);

  return (
    <>
      <PageHeader
        back={{ href: '/tutores', label: 'Tutores' }}
        breadcrumb={
          <Link href="/tutores" className="hover:text-[var(--brand)]">
            Tutores
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {guardian.name}
            {inactive && <Badge tone="muted">Inativo</Badge>}
          </span>
        }
        description={[
          guardian.personType === 'company' ? 'Pessoa jurídica' : 'Pessoa física',
          guardian.documentMasked,
          `#${guardian.number}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {can('guardian:update') && (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {can('guardian:export') && (
              <Button variant="secondary" size="sm" onClick={() => void exportData()}>
                <Download className="h-4 w-4" />
                Exportar dados
              </Button>
            )}
            {can('patient:create') && !inactive && (
              <Button size="sm" onClick={() => setPatientOpen(true)}>
                Novo paciente
              </Button>
            )}
          </>
        }
      />

      {inactive && (
        <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px] text-[var(--ink-2)] sm:flex-row sm:items-center">
          <Archive className="hidden h-4 w-4 shrink-0 text-[var(--ink-3)] sm:block" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold text-[var(--ink)]">
              Cadastro inativo desde {formatDate(guardian.inactiveAt)}.
            </strong>{' '}
            {guardian.inactiveReason ? `Motivo: ${guardian.inactiveReason}. ` : ''}
            Não aparece na busca para vincular a um paciente; os pacientes abaixo continuam vinculados.
          </p>
          {can('guardian:update') && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start sm:self-auto"
              onClick={() => reactivate.mutate()}
              loading={reactivate.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Reativar
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr] md:gap-5">
        <Card>
          <CardHeader title="Contato" />
          <dl className="px-4 py-2">
            <DataRow label="Telefone" value={formatPhone(guardian.phonePrimary)} />
            <DataRow label="Telefone 2" value={formatPhone(guardian.phoneSecondary)} />
            <DataRow label="E-mail" value={guardian.email} />
            <DataRow label="Nascimento" value={guardian.birthDate ? formatDate(guardian.birthDate) : null} />
            <DataRow
              label="Endereço"
              value={
                guardian.address
                  ? [
                      guardian.address.street,
                      guardian.address.number,
                      guardian.address.district,
                      guardian.address.city,
                      guardian.address.state,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : null
              }
            />
            <DataRow label="Cadastrado em" value={formatDate(guardian.createdAt)} />
          </dl>

          {(guardian.phonePrimary || wa) && (
            <div className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
              {guardian.phonePrimary && (
                <Button asChild variant="secondary" size="sm">
                  <a href={`tel:${guardian.phonePrimary.replace(/\D/g, '')}`}>
                    <Phone className="h-4 w-4" />
                    Ligar
                  </a>
                </Button>
              )}
              {wa && (
                <Button asChild variant="secondary" size="sm">
                  <a href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}

          {guardian.notes && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Observações</p>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-[var(--ink-2)]">{guardian.notes}</p>
            </div>
          )}

          {can('guardian:update') && !inactive && (
            <div className="border-t border-[var(--border)] px-4 py-2">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setInactivateOpen(true)}>
                <Archive className="h-4 w-4" />
                Inativar tutor
              </Button>
            </div>
          )}

          {can('guardian:anonymize') && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">LGPD</p>
              <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                A anonimização apaga os dados pessoais e preserva o histórico clínico dos pacientes, que é registro
                obrigatório.
              </p>
              <Button variant="dangerGhost" size="sm" className="mt-2 px-0" onClick={() => setAnonymizeOpen(true)}>
                <ShieldOff className="h-4 w-4" />
                Anonimizar dados pessoais
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Pacientes" />
          {(patients?.items ?? []).length === 0 ? (
            <EmptyState
              title="Nenhum paciente vinculado"
              description={inactive ? 'Reative o cadastro para vincular um animal.' : 'Cadastre o animal deste tutor.'}
              action={
                can('patient:create') && !inactive ? (
                  <Button onClick={() => setPatientOpen(true)}>Novo paciente</Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {(patients?.items ?? []).map((patient) => {
                const statusInfo = statusFor(PATIENT_STATUS, patient.status);
                return (
                  <li key={patient.id}>
                    <Link
                      href={`/pacientes/${patient.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-medium text-[var(--ink)]">{patient.name}</span>
                          {patient.status !== 'active' && (
                            <Badge tone={statusInfo.tone} className="shrink-0">
                              {statusInfo.label}
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                          {[patient.speciesName, patient.breedName, patient.ageLabel].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <GuardianFormSheet open={editOpen} onOpenChange={setEditOpen} guardian={guardian} />
      <PatientFormSheet open={patientOpen} onOpenChange={setPatientOpen} presetGuardian={guardian} />

      <InactivateSheet
        open={inactivateOpen}
        onOpenChange={setInactivateOpen}
        title={`Inativar ${guardian.name}`}
        description="Para quem não frequenta mais a clínica. Volta atrás a qualquer momento."
        reasons={GUARDIAN_REASONS}
        loading={inactivate.isPending}
        onConfirm={(input) => inactivate.mutate(input)}
        note={
          <>
            O tutor some da busca ao vincular ou cadastrar paciente, mas continua na lista de tutores (filtro
            &ldquo;Inativos&rdquo;). Os pacientes seguem vinculados a ele; para trocar o responsável, use a ficha do
            paciente. Não é anonimização: os dados pessoais continuam guardados.
          </>
        }
      />

      <ConfirmSheet
        open={anonymizeOpen}
        onOpenChange={setAnonymizeOpen}
        title="Anonimizar dados pessoais"
        confirmLabel="Anonimizar"
        destructive
        loading={anonymize.isPending}
        onConfirm={() => anonymize.mutate()}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Nome, documento, contatos e endereço serão apagados de forma irreversível. Os atendimentos, receitas e
          exames dos pacientes continuam registrados, como exige a guarda de documentação clínica. A operação fica na
          auditoria.
        </p>
      </ConfirmSheet>

      {stepUp.dialog}
    </>
  );
}
