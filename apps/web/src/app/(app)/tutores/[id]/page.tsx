'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Pencil, Phone, ShieldOff } from 'lucide-react';
import type { Guardian, PatientListItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatPhone, whatsappLink } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Card, CardHeader, DataRow, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/sheet';
import { GuardianFormSheet } from '@/components/guardians/guardian-form';
import { PatientFormSheet } from '@/components/patients/patient-form';
import { useStepUp } from '@/components/auth/step-up';

export default function GuardianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { can } = useSession();
  const stepUp = useStepUp();

  const [editOpen, setEditOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);

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
    onSuccess: async () => {
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

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/tutores" className="hover:text-[var(--brand)]">
            Tutores
          </Link>
        }
        title={guardian.name}
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
            {can('patient:create') && (
              <Button size="sm" onClick={() => setPatientOpen(true)}>
                Novo paciente
              </Button>
            )}
          </>
        }
      />

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
              description="Cadastre o animal deste tutor."
              action={
                can('patient:create') ? <Button onClick={() => setPatientOpen(true)}>Novo paciente</Button> : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {(patients?.items ?? []).map((patient) => (
                <li key={patient.id}>
                  <Link
                    href={`/pacientes/${patient.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-[var(--ink)]">
                        {patient.name}
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                        {[patient.speciesName, patient.breedName, patient.ageLabel].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <GuardianFormSheet open={editOpen} onOpenChange={setEditOpen} guardian={guardian} />
      <PatientFormSheet open={patientOpen} onOpenChange={setPatientOpen} presetGuardian={guardian} />

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
