'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Phone, Star, UserMinus, UserPlus } from 'lucide-react';
import type { GuardianRole, Patient, PatientGuardianLink } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatPhone, whatsappLink } from '@/lib/format';
import { GUARDIAN_ROLE, labelFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { ConfirmSheet, Sheet } from '@/components/ui/sheet';
import { MountWhenOpen } from '@/components/ui/mount-when-open';
import { GuardianPicker } from '@/components/guardians/guardian-picker';

/** Atualiza a ficha com o paciente que a API devolve e as listas que mostram tutor. */
function useApplyPatient(patientId: string) {
  const queryClient = useQueryClient();
  return (updated: Patient) => {
    queryClient.setQueryData(['patient', patientId], updated);
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
    void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    void queryClient.invalidateQueries({ queryKey: ['guardian'] });
  };
}

/**
 * Tutores do paciente com o que a recepção precisa no balcão: ligar, somar
 * cotutor, trocar o principal e desvincular quem saiu. Desvincular encerra o
 * vínculo com data; o paciente nunca fica sem tutor.
 */
export function PatientGuardiansCard({ patient }: { patient: Patient }) {
  const { can } = useSession();
  const canEdit = can('patient:update');
  const applyPatient = useApplyPatient(patient.id);
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<PatientGuardianLink | null>(null);

  const makePrimary = useMutation({
    mutationFn: (guardianId: string) => api.post<Patient>(`/patients/${patient.id}/guardians/${guardianId}/primary`),
    onSuccess: (updated) => {
      applyPatient(updated);
      toast.success('Tutor principal atualizado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const unlink = useMutation({
    mutationFn: (guardianId: string) => api.delete<Patient>(`/patients/${patient.id}/guardians/${guardianId}`),
    onSuccess: (updated) => {
      applyPatient(updated);
      setUnlinking(null);
      toast.success('Tutor desvinculado. O vínculo antigo continua registrado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const single = patient.guardians.length === 1;

  return (
    <Card>
      <CardHeader
        title="Tutores"
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Vincular tutor
            </Button>
          ) : undefined
        }
      />
      {patient.guardians.length === 0 ? (
        <EmptyState
          title="Sem tutor vinculado"
          description="Vincule um responsável ao paciente."
          action={canEdit ? <Button onClick={() => setLinkOpen(true)}>Vincular tutor</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {patient.guardians.map((link) => {
            const wa = whatsappLink(link.guardianPhone);
            return (
              <li key={`${link.guardianId}-${link.role}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tutores/${link.guardianId}`}
                      className="block truncate text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                    >
                      {link.guardianName}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-[var(--ink-3)]">
                      {labelFor(GUARDIAN_ROLE, link.role)}
                      {link.isPrimary ? ' · principal' : ''}
                      {link.guardianInactive && (
                        <Badge tone="muted" className="px-2 py-0 text-[11px]">
                          Tutor inativo
                        </Badge>
                      )}
                    </p>
                    {link.guardianPhone && (
                      <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">{formatPhone(link.guardianPhone)}</p>
                    )}
                  </div>
                  {link.guardianPhone && (
                    <div className="flex shrink-0 gap-1">
                      <a
                        href={`tel:${link.guardianPhone.replace(/\D/g, '')}`}
                        aria-label={`Ligar para ${link.guardianName}`}
                        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--ink-2)]"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp de ${link.guardianName}`}
                          className="flex h-10 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[12.5px] font-medium text-[var(--ink-2)]"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {canEdit && (!link.isPrimary || !single) && (
                  <div className="-ml-2 mt-1 flex flex-wrap gap-1">
                    {!link.isPrimary && !link.guardianInactive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => makePrimary.mutate(link.guardianId)}
                        loading={makePrimary.isPending && makePrimary.variables === link.guardianId}
                      >
                        <Star className="h-4 w-4" />
                        Tornar principal
                      </Button>
                    )}
                    {!single && (
                      <Button variant="dangerGhost" size="sm" onClick={() => setUnlinking(link)}>
                        <UserMinus className="h-4 w-4" />
                        Desvincular
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && single && (
        <p className="border-t border-[var(--border)] px-4 py-2.5 text-[12.5px] text-[var(--ink-3)]">
          Para trocar o tutor, vincule o novo como principal e depois desvincule o anterior.
        </p>
      )}

      <LinkGuardianSheet open={linkOpen} onOpenChange={setLinkOpen} patient={patient} onLinked={applyPatient} />

      <ConfirmSheet
        open={unlinking !== null}
        onOpenChange={(next) => {
          if (!next) setUnlinking(null);
        }}
        title="Desvincular tutor"
        confirmLabel="Desvincular"
        destructive
        loading={unlink.isPending}
        onConfirm={() => {
          if (unlinking) unlink.mutate(unlinking.guardianId);
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          {unlinking?.guardianName} deixa de ser responsável por {patient.name} a partir de hoje. O vínculo antigo fica
          registrado com a data de encerramento; nada é apagado.
          {unlinking?.isPrimary ? ' Outro tutor vinculado passa a ser o principal.' : ''}
        </p>
      </ConfirmSheet>
    </Card>
  );
}

const ROLE_ORDER: GuardianRole[] = [
  'owner',
  'co_owner',
  'financial_responsible',
  'authorized_contact',
  'caretaker',
  'institution',
];

function LinkGuardianSheetContent({
  open,
  onOpenChange,
  patient,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  onLinked: (patient: Patient) => void;
}) {
  const hasGuardian = patient.guardians.length > 0;
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [guardian, setGuardian] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<GuardianRole>(hasGuardian ? 'co_owner' : 'owner');
  const [isPrimary, setIsPrimary] = useState(!hasGuardian);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Patient>(
        `/patients/${patient.id}/guardians`,
        mode === 'new'
          ? {
              newGuardian: { name: name.trim(), documentKind: 'none', phonePrimary: phone.trim() || undefined },
              role,
              isPrimary,
            }
          : { guardianId: guardian?.id, role, isPrimary },
      ),
    onSuccess: (updated) => {
      onLinked(updated);
      toast.success(mode === 'new' ? 'Tutor cadastrado e vinculado.' : 'Tutor vinculado.');
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldIssues.length > 0) {
        setErrors(
          Object.fromEntries(error.fieldIssues.map((issue) => [issue.path.replace(/^newGuardian\./, ''), issue.message])),
        );
      }
      toast.error(errorMessage(error));
    },
  });

  function submit() {
    const next: Record<string, string> = {};
    if (mode === 'existing' && !guardian) next.guardianId = 'Escolha o tutor ou cadastre um novo.';
    if (mode === 'new' && name.trim().length < 2) next.name = 'Informe o nome do tutor.';
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Vincular tutor"
      description={`Responsável por ${patient.name}: cotutor, quem paga ou quem traz o animal.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Vincular
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'existing' ? (
          <div className="space-y-1">
            <GuardianPicker value={guardian} onChange={setGuardian} error={errors.guardianId} />
            <button
              type="button"
              onClick={() => {
                setMode('new');
                setGuardian(null);
                setErrors({});
              }}
              className="flex min-h-10 items-center text-[13.5px] font-medium text-[var(--brand)]"
            >
              Cadastrar um tutor novo agora
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <Field label="Nome do tutor" required error={errors.name}>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome completo"
                autoComplete="off"
              />
            </Field>
            <Field label="Telefone" error={errors.phonePrimary}>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(11) 90000-0000"
                inputMode="tel"
                autoComplete="off"
              />
            </Field>
            <p className="text-[12.5px] text-[var(--ink-3)]">CPF e endereço podem ser completados depois na ficha do tutor.</p>
            <button
              type="button"
              onClick={() => {
                setMode('existing');
                setErrors({});
              }}
              className="flex min-h-10 items-center text-[13.5px] font-medium text-[var(--brand)]"
            >
              Escolher um tutor já cadastrado
            </button>
          </div>
        )}

        <Field label="Papel">
          <Select value={role} onChange={(event) => setRole(event.target.value as GuardianRole)}>
            {ROLE_ORDER.map((key) => (
              <option key={key} value={key}>
                {GUARDIAN_ROLE[key]}
              </option>
            ))}
          </Select>
        </Field>

        <Checkbox
          label={
            hasGuardian
              ? 'Tornar o tutor principal (contato de referência da ficha)'
              : 'Será o tutor principal: é o primeiro vínculo do paciente'
          }
          checked={isPrimary || !hasGuardian}
          disabled={!hasGuardian}
          onChange={(event) => setIsPrimary(event.target.checked)}
          className="min-h-10"
        />
      </div>
    </Sheet>
  );
}

function LinkGuardianSheet(props: React.ComponentProps<typeof LinkGuardianSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <LinkGuardianSheetContent {...props} />
    </MountWhenOpen>
  );
}
