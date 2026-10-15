'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, MailCheck, RotateCw, UserPlus } from 'lucide-react';
import {
  BRAZILIAN_STATES,
  invitationPendingConflictSchema,
  type InvitationPendingConflict,
  type InviteMemberResponse,
  type Member,
  type PendingInvitation,
  type RoleSummary,
} from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ConfirmSheet, Sheet } from '@/components/ui/sheet';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { useStepUp } from '@/components/auth/step-up';

const INVITATIONS_KEY = ['member-invitations'] as const;

/** Mesmo critério frouxo do servidor: pega o erro de digitação, não valida domínio. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado.');
  } catch {
    toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
  }
}

/** O link só volta da API em desenvolvimento; em produção ele vai apenas por e-mail. */
function devLinkAction(url: string | undefined) {
  return url ? { action: { label: 'Copiar link', onClick: () => void copyLink(url) } } : undefined;
}

export function MembersPanel() {
  const queryClient = useQueryClient();
  const { can, context } = useSession();
  const stepUp = useStepUp();
  const [inviteOpen, setInviteOpen] = useState(false);
  const canInvite = can('member:invite');

  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get<{ items: Member[] }>('/members'),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: RoleSummary[] }>('/roles'),
    enabled: can('role:read'),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, roleKey }: { id: string; roleKey: string }) =>
      stepUp.run(() => api.patch(`/members/${id}`, { roleKey })),
    onSuccess: async (done) => {
      if (!done) return;
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Papel atualizado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      stepUp.run(() => api.patch(`/members/${id}`, { status })),
    onSuccess: async (done) => {
      if (!done) return;
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Situação atualizada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const members = data?.items ?? [];

  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid min-w-0 content-start gap-4 md:gap-5">
        <Card>
          <CardHeader
            title="Equipe"
            action={
              canInvite ? (
                <Button onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  Convidar
                </Button>
              ) : undefined
            }
          />
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : members.length === 0 ? (
            <EmptyState title="Nenhum membro" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {members.map((member) => (
                <li key={member.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-medium text-[var(--ink)]">{member.name}</span>
                        {member.isOwner && <Badge tone="brand">Proprietário</Badge>}
                        {member.status === 'invited' && <Badge tone="warning">Convidado</Badge>}
                        {member.status === 'suspended' && <Badge tone="muted">Suspenso</Badge>}
                      </div>
                      <p className="truncate text-[12.5px] text-[var(--ink-3)]">{member.email}</p>
                      {member.professional && (
                        <p className="text-[12.5px] text-[var(--ink-3)]">
                          {member.professional.council} {member.professional.councilNumber}
                          {member.professional.councilState ? `-${member.professional.councilState}` : ''}
                          {member.professional.isLicensed ? '' : ' · registro vencido ou ausente'}
                        </p>
                      )}
                    </div>

                    {can('member:update') && !member.isOwner && (
                      <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
                        <Select
                          aria-label={`Papel de ${member.name}`}
                          value={member.roles[0]?.key ?? ''}
                          onChange={(event) => changeRole.mutate({ id: member.id, roleKey: event.target.value })}
                          className="min-w-0 flex-1 text-[13px] sm:w-44 sm:flex-none"
                        >
                          {(roles?.items ?? []).map((role) => (
                            <option key={role.key} value={role.key}>
                              {role.name}
                            </option>
                          ))}
                        </Select>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            changeStatus.mutate({
                              id: member.id,
                              status: member.status === 'suspended' ? 'active' : 'suspended',
                            })
                          }
                        >
                          {member.status === 'suspended' ? 'Reativar' : 'Suspender'}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canInvite && <PendingInvitationsCard onInvite={() => setInviteOpen(true)} />}
      </div>

      <Card className="min-w-0">
        <CardHeader title="Papéis" description="Cada papel é um conjunto de permissões verificadas no servidor." />
        <ul className="divide-y divide-[var(--border)]">
          {(roles?.items ?? []).map((role) => (
            <li key={role.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium text-[var(--ink)]">{role.name}</span>
                {role.requiresLicense && <Badge tone="info">Exige CRMV</Badge>}
                <span className="ml-auto text-[12px] tabular text-[var(--ink-3)]">
                  {role.permissionCount} permissões
                </span>
              </div>
              {role.description && <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">{role.description}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles?.items ?? []}
        isOwner={Boolean(context?.membership?.isOwner)}
        organizationName={context?.tenant?.name ?? null}
      />
      {stepUp.dialog}
    </div>
  );
}

// ------------------------------------------------------------ convites pendentes

function PendingInvitationsCard({ onInvite }: { onInvite: () => void }) {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: () => api.get<{ items: PendingInvitation[] }>('/members/invitations'),
  });

  const resend = useMutation({
    mutationFn: (invitation: PendingInvitation) =>
      api.post<InviteMemberResponse>(`/members/invitations/${invitation.id}/resend`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      toast.success(
        `Novo convite enviado para ${result.email}. O link anterior deixou de valer.`,
        devLinkAction(result.inviteUrl),
      );
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      toast.error(errorMessage(error));
    },
  });

  const revoke = useMutation({
    mutationFn: (invitation: PendingInvitation) => api.delete(`/members/invitations/${invitation.id}`),
    onSuccess: async (_, invitation) => {
      setRevoking(null);
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      toast.success(`Convite para ${invitation.email} revogado. O link deixou de funcionar.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader title="Convites pendentes" description="Quem foi convidado e ainda não entrou." />
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : isError ? (
        <p className="px-4 py-4 text-[13px] text-[var(--ink-3)]">Não foi possível carregar os convites agora.</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum convite pendente"
          description="Quando você convidar alguém, o convite aparece aqui até a pessoa entrar."
          action={
            <Button variant="secondary" onClick={onInvite}>
              <UserPlus className="h-4 w-4" />
              Convidar
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((invitation) => {
            const expired = invitation.status === 'expired';
            return (
              <li key={invitation.id} className="px-4 py-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-all text-[14.5px] font-medium text-[var(--ink)]">
                        {invitation.name ?? invitation.email}
                      </span>
                      {expired ? <Badge tone="danger">Expirado</Badge> : <Badge tone="warning">Aguardando</Badge>}
                    </div>
                    {invitation.name && (
                      <p className="break-all text-[12.5px] text-[var(--ink-3)]">{invitation.email}</p>
                    )}
                    <p className="text-[12.5px] text-[var(--ink-3)]">
                      {invitation.role.name} · enviado em {formatDate(invitation.sentAt)} ·{' '}
                      {expired
                        ? `venceu em ${formatDate(invitation.expiresAt)}`
                        : `vale até ${formatDate(invitation.expiresAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 sm:flex-none"
                      aria-label={`Reenviar convite para ${invitation.email}`}
                      loading={resend.isPending && resend.variables?.id === invitation.id}
                      onClick={() => resend.mutate(invitation)}
                    >
                      <RotateCw className="h-4 w-4" />
                      Reenviar
                    </Button>
                    <Button
                      variant="dangerGhost"
                      className="flex-1 sm:flex-none"
                      aria-label={`Revogar convite para ${invitation.email}`}
                      onClick={() => setRevoking(invitation)}
                    >
                      Revogar
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmSheet
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Revogar convite?"
        description={revoking ? `O link enviado para ${revoking.email} deixa de funcionar na hora.` : undefined}
        confirmLabel="Revogar convite"
        destructive
        loading={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking);
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Se mudar de ideia, basta convidar de novo. A revogação fica registrada na auditoria.
        </p>
      </ConfirmSheet>
    </Card>
  );
}

// ------------------------------------------------------------------- convite

type InviteField = 'email' | 'name' | 'roleKey' | 'councilNumber' | 'councilState';
type InviteErrors = Partial<Record<InviteField, string>>;

/** Caminho do erro no contrato para o campo do formulário. */
const FIELD_BY_PATH: Record<string, InviteField> = {
  email: 'email',
  name: 'name',
  roleKey: 'roleKey',
  'professional.councilNumber': 'councilNumber',
  'professional.councilState': 'councilState',
};

/** Ordem de cima para baixo, para levar o foco ao primeiro campo com problema. */
const FIELD_IDS: Record<InviteField, string> = {
  email: 'convite-email',
  name: 'convite-nome',
  roleKey: 'convite-papel',
  councilNumber: 'convite-crmv',
  councilState: 'convite-uf',
};

function focusFirst(errors: InviteErrors) {
  const first = (Object.keys(FIELD_IDS) as InviteField[]).find((field) => errors[field]);
  if (first) document.getElementById(FIELD_IDS[first])?.focus();
}

interface InviteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleSummary[];
  isOwner: boolean;
  organizationName: string | null;
}

function InviteSheetContent({ open, onOpenChange, roles, isOwner, organizationName }: InviteSheetProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [chosenRoleKey, setChosenRoleKey] = useState('');
  const [isProfessional, setIsProfessional] = useState(false);
  const [councilNumber, setCouncilNumber] = useState('');
  const [councilState, setCouncilState] = useState('');
  const [errors, setErrors] = useState<InviteErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<(InvitationPendingConflict & { email: string }) | null>(null);
  const [sent, setSent] = useState<{ result: InviteMemberResponse; resent: boolean } | null>(null);

  // Papel de proprietário só aparece para o proprietário: o servidor recusaria.
  const assignable = roles.filter((role) => role.key !== 'owner' || isOwner);
  const roleKey =
    chosenRoleKey || assignable.find((role) => role.key === 'veterinarian')?.key || assignable[0]?.key || '';
  const selectedRole = assignable.find((role) => role.key === roleKey);
  // Derivado do papel, não copiado para o estado por efeito: trocar de
  // veterinário para técnico tira a obrigação na hora.
  const requiresLicense = Boolean(selectedRole?.requiresLicense);
  const withLicense = requiresLicense || isProfessional;

  function clearError(field: InviteField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function validate(): InviteErrors {
    const found: InviteErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) found.email = 'Informe o e-mail.';
    else if (!EMAIL_PATTERN.test(trimmedEmail)) found.email = 'Confira o e-mail: parece incompleto.';
    if (name.trim() && name.trim().length < 2) found.name = 'O nome precisa ter ao menos 2 letras.';
    if (!roleKey) found.roleKey = 'Escolha o papel.';
    if (withLicense) {
      if (!councilNumber.trim()) {
        found.councilNumber = requiresLicense
          ? 'Informe o número do CRMV.'
          : 'Informe o número do CRMV ou desmarque a opção acima.';
      }
      if (!councilState) found.councilState = 'Escolha a UF.';
    }
    return found;
  }

  function showError(error: unknown) {
    if (error instanceof ApiError) {
      const conflict = invitationPendingConflictSchema.safeParse(error.details);
      if (error.isConflict && conflict.success) {
        setPending({ ...conflict.data, email: email.trim().toLowerCase() });
        return;
      }
      const byField: InviteErrors = {};
      for (const issue of error.fieldIssues) {
        const field = FIELD_BY_PATH[issue.path];
        if (field && !byField[field]) byField[field] = issue.message;
      }
      if (Object.keys(byField).length > 0) {
        setErrors(byField);
        focusFirst(byField);
        return;
      }
    }
    setFormError(errorMessage(error, 'Não foi possível enviar o convite.'));
  }

  const invite = useMutation({
    mutationFn: () =>
      api.post<InviteMemberResponse>('/members/invite', {
        email: email.trim(),
        name: name.trim() || undefined,
        roleKey,
        allFacilities: true,
        professional: withLicense
          ? {
              council: 'CRMV',
              councilNumber: councilNumber.trim(),
              councilState,
              specialties: [],
            }
          : undefined,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      setSent({ result, resent: false });
    },
    onError: async (error) => {
      // O convite pode ter sido gravado e só o e-mail ter falhado: a lista mostra.
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      showError(error);
    },
  });

  const resend = useMutation({
    mutationFn: (invitationId: string) =>
      api.post<InviteMemberResponse>(`/members/invitations/${invitationId}/resend`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      setPending(null);
      setSent({ result, resent: true });
    },
    onError: (error) => setFormError(errorMessage(error, 'Não foi possível reenviar o convite.')),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    invite.mutate();
  }

  /** Mantém o papel: quem convida a equipe costuma convidar várias pessoas iguais. */
  function inviteAnother() {
    setEmail('');
    setName('');
    setIsProfessional(false);
    setCouncilNumber('');
    setErrors({});
    setFormError(null);
    setPending(null);
    setSent(null);
  }

  if (sent) {
    const { result, resent } = sent;
    // Chave própria: a confirmação é outra etapa, e o que foi digitado no
    // formulário não pode fazer o fechar daqui perguntar se descarta algo.
    return (
      <Sheet
        key="enviado"
        open={open}
        onOpenChange={onOpenChange}
        title={resent ? 'Convite reenviado' : 'Convite enviado'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={inviteAnother} className="sm:w-auto">
              Convidar outra pessoa
            </Button>
            <Button onClick={() => onOpenChange(false)} className="sm:w-auto">
              Concluir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div role="status" className="flex items-start gap-3 rounded-[var(--radius)] bg-[var(--success-soft)] px-3 py-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[var(--ink)]">
                {resent ? 'Novo convite enviado para ' : 'Convite enviado para '}
                <span className="break-all">{result.email}</span>
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">
                {resent ? 'O link anterior deixou de valer. ' : ''}
                {organizationName
                  ? `A pessoa recebe por e-mail um link para entrar em ${organizationName}.`
                  : 'A pessoa recebe por e-mail um link para entrar na clínica.'}{' '}
                O link vale até {formatDate(result.expiresAt)} e funciona uma única vez.
              </p>
            </div>
          </div>

          <p className="text-[13px] text-[var(--ink-3)]">
            Enquanto a pessoa não entrar, o convite fica em <strong>Convites pendentes</strong>, onde dá para
            reenviar ou revogar.
          </p>

          {result.inviteUrl && (
            <div className="space-y-1.5">
              <p className="text-[12.5px] text-[var(--ink-3)]">
                Link de teste (aparece só em desenvolvimento, sem provedor de e-mail):
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  aria-label="Link do convite"
                  value={result.inviteUrl}
                  className="min-w-0 font-mono text-[12px]"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="shrink-0"
                  aria-label="Copiar link do convite"
                  onClick={() => void copyLink(result.inviteUrl ?? '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      key="formulario"
      open={open}
      onOpenChange={onOpenChange}
      title="Convidar para a equipe"
      description="A pessoa recebe um link por e-mail e define a própria senha."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button type="submit" form="convite-form" loading={invite.isPending} className="sm:w-auto">
            Enviar convite
          </Button>
        </>
      }
    >
      <form id="convite-form" onSubmit={submit} noValidate className="space-y-3">
        {pending && (
          <div role="alert" className="rounded-[var(--radius)] bg-[var(--warning-soft)] px-3 py-3">
            <p className="text-[14px] font-medium text-[var(--ink)]">
              Já existe um convite pendente para <span className="break-all">{pending.email}</span>.
            </p>
            <p className="mt-1 text-[13px] text-[var(--ink-2)]">
              Enviado em {formatDate(pending.sentAt)}, vale até {formatDate(pending.expiresAt)}. Reenviar manda
              um link novo e o anterior deixa de valer.
            </p>
            <Button
              type="button"
              className="mt-3 w-full sm:w-auto"
              loading={resend.isPending}
              onClick={() => resend.mutate(pending.invitationId)}
            >
              <RotateCw className="h-4 w-4" />
              Reenviar convite
            </Button>
          </div>
        )}

        <Field label="E-mail" required error={errors.email}>
          <Input
            id={FIELD_IDS.email}
            autoFocus
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPending(null);
              clearError('email');
            }}
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label="Nome" hint="Opcional. A pessoa pode corrigir ao aceitar." error={errors.name}>
          <Input
            id={FIELD_IDS.name}
            value={name}
            autoComplete="off"
            autoCapitalize="words"
            onChange={(event) => {
              setName(event.target.value);
              clearError('name');
            }}
          />
        </Field>
        <Field label="Papel" required error={errors.roleKey}>
          <Select
            id={FIELD_IDS.roleKey}
            value={roleKey}
            onChange={(event) => {
              setChosenRoleKey(event.target.value);
              setErrors((current) => ({ ...current, roleKey: undefined, councilNumber: undefined, councilState: undefined }));
              setFormError(null);
            }}
          >
            {assignable.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>

        {requiresLicense ? (
          <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
            {selectedRole?.name ?? 'Este papel'} assina prontuário e receita, então o CRMV é obrigatório.
          </p>
        ) : (
          <Checkbox
            checked={isProfessional}
            onChange={(event) => {
              setIsProfessional(event.target.checked);
              setErrors((current) => ({ ...current, councilNumber: undefined, councilState: undefined }));
            }}
            label="Tem registro no CRMV (cadastrar como profissional)"
          />
        )}

        {withLicense && (
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <Field label="Número do CRMV" required error={errors.councilNumber}>
              <Input
                id={FIELD_IDS.councilNumber}
                value={councilNumber}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={(event) => {
                  setCouncilNumber(event.target.value);
                  clearError('councilNumber');
                }}
              />
            </Field>
            <Field label="UF" required error={errors.councilState}>
              <Select
                id={FIELD_IDS.councilState}
                value={councilState}
                onChange={(event) => {
                  setCouncilState(event.target.value);
                  clearError('councilState');
                }}
              >
                <option value="">UF</option>
                {BRAZILIAN_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]"
          >
            {formError}
          </div>
        )}
      </form>
    </Sheet>
  );
}

function InviteSheet(props: InviteSheetProps) {
  return props.open ? <InviteSheetContent {...props} /> : null;
}
