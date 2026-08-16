'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, UserPlus } from 'lucide-react';
import type { Member } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { useStepUp } from '@/components/auth/step-up';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  requiresLicense: boolean;
  permissionCount: number;
}

export function MembersPanel() {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const stepUp = useStepUp();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get<{ items: Member[] }>('/members'),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[] }>('/roles'),
    enabled: can('role:read'),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, roleKey }: { id: string; roleKey: string }) =>
      stepUp.run(() => api.patch(`/members/${id}`, { roleKey })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Papel atualizado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      stepUp.run(() => api.patch(`/members/${id}`, { status })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Situação atualizada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const members = data?.items ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] md:gap-5">
      <Card>
        <CardHeader
          title="Equipe"
          action={
            can('member:invite') ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
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
                        {member.professional.isLicensed ? '' : ' · registro vencido ou ausente'}
                      </p>
                    )}
                  </div>

                  {can('member:update') && !member.isOwner && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Select
                        value={member.roles[0]?.key ?? ''}
                        onChange={(event) => changeRole.mutate({ id: member.id, roleKey: event.target.value })}
                        className="h-9 w-40 text-[13px]"
                      >
                        {(roles?.items ?? []).map((role) => (
                          <option key={role.key} value={role.key}>
                            {role.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
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

      <Card>
        <CardHeader title="Papéis" description="Cada papel é um conjunto de permissões verificadas no servidor." />
        <ul className="divide-y divide-[var(--border)]">
          {(roles?.items ?? []).map((role) => (
            <li key={role.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-[var(--ink)]">{role.name}</span>
                {role.requiresLicense && <Badge tone="info">Exige registro</Badge>}
                <span className="ml-auto text-[12px] tabular text-[var(--ink-3)]">
                  {role.permissionCount} permissões
                </span>
              </div>
              {role.description && <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">{role.description}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} roles={roles?.items ?? []} />
      {stepUp.dialog}
    </div>
  );
}

function InviteSheetContent({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [chosenRoleKey, setChosenRoleKey] = useState('');
  const [isProfessional, setIsProfessional] = useState(false);
  const [councilNumber, setCouncilNumber] = useState('');
  const [councilState, setCouncilState] = useState('SP');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const roleKey =
    chosenRoleKey || roles.find((role) => role.key === 'veterinarian')?.key || roles[0]?.key || '';

  const selectedRole = roles.find((role) => role.key === roleKey);
  // Papel que assina documento clínico sempre exige registro de conselho:
  // a marcação é derivada, não copiada para o estado por um efeito.
  const requiresProfessional = Boolean(selectedRole?.requiresLicense);
  const isProfessionalEffective = requiresProfessional || isProfessional;

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string; inviteUrl: string }>('/members/invite', {
        email: email.trim(),
        name: name.trim() || undefined,
        roleKey,
        allFacilities: true,
        professional:
          isProfessionalEffective && councilNumber.trim()
            ? {
                council: 'CRMV',
                councilNumber: councilNumber.trim(),
                councilState: councilState.trim().toUpperCase(),
                specialties: [],
              }
            : undefined,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setInviteUrl(result.inviteUrl);
      toast.success('Convite gerado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Convidar para a equipe"
      size="sm"
      footer={
        inviteUrl ? (
          <Button onClick={() => onOpenChange(false)} className="sm:w-auto">
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
              Gerar convite
            </Button>
          </>
        )
      }
    >
      {inviteUrl ? (
        <div className="space-y-3">
          <p className="text-[14px] text-[var(--ink-2)]">
            Envie este link para a pessoa. Ele define a senha e entra na organização.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={inviteUrl} className="font-mono text-[12px]" />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                toast.success('Link copiado.');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[12.5px] text-[var(--ink-3)]">O convite tem prazo de validade e uso único.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="E-mail" required>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputMode="email"
              autoCapitalize="none"
            />
          </Field>
          <Field label="Nome">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Papel" required>
            <Select value={roleKey} onChange={(event) => setChosenRoleKey(event.target.value)}>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          <Checkbox
            checked={isProfessionalEffective}
            disabled={requiresProfessional}
            onChange={(event) => setIsProfessional(event.target.checked)}
            label="Cadastrar como profissional com registro de conselho"
          />

          {isProfessionalEffective && (
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <Field label="Número do CRMV" required>
                <Input value={councilNumber} onChange={(event) => setCouncilNumber(event.target.value)} />
              </Field>
              <Field label="UF">
                <Input
                  value={councilState}
                  onChange={(event) => setCouncilState(event.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              </Field>
            </div>
          )}

          {selectedRole?.requiresLicense && (
            <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
              Este papel assina documentos clínicos, então exige registro de conselho válido no cadastro.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function InviteSheet(props: React.ComponentProps<typeof InviteSheetContent>) {
  return props.open ? <InviteSheetContent {...props} /> : null;
}
