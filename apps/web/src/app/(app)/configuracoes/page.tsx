'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MODULES, type ModuleKey } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Tabs } from '@/components/ui/tabs';
import { MembersPanel } from '@/components/settings/members-panel';
import { CatalogPanel } from '@/components/settings/catalog-panel';

interface Entitlement {
  moduleKey: ModuleKey;
  state: 'active' | 'trial' | 'suspended' | 'disabled';
  source: string;
  expiresAt: string | null;
}

export default function SettingsPage() {
  const { context, can } = useSession();
  const [tab, setTab] = useState<'organizacao' | 'equipe' | 'modulos' | 'catalogos'>('organizacao');

  return (
    <>
      <PageHeader title="Configurações" description={context?.tenant?.name} />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'organizacao', label: 'Organização' },
          { key: 'equipe', label: 'Equipe', disabled: !can('member:read') },
          { key: 'modulos', label: 'Módulos', disabled: !can('entitlement:read') },
          { key: 'catalogos', label: 'Catálogos', disabled: !can('service:read') },
        ]}
      />

      {/* A chave é o tenant: trocar de organização remonta o painel com os
          valores da nova, sem efeito copiando dado para estado. */}
      {tab === 'organizacao' && <OrganizationPanel key={context?.tenant?.id ?? 'sem-tenant'} />}
      {tab === 'equipe' && <MembersPanel />}
      {tab === 'modulos' && <ModulesPanel />}
      {tab === 'catalogos' && <CatalogPanel />}
    </>
  );
}

function OrganizationPanel() {
  const queryClient = useQueryClient();
  const { context, can, refresh } = useSession();

  const [name, setName] = useState(context?.tenant?.name ?? '');
  const [prescriptionHeader, setPrescriptionHeader] = useState(
    String(context?.tenant?.settings?.prescriptionHeader ?? ''),
  );

  const { data: facilities } = useQuery({
    queryKey: ['facilities'],
    queryFn: () =>
      api.get<{ items: Array<{ id: string; name: string; code: string; kind: string; phone: string | null; timezone: string; isDefault: boolean }> }>(
        '/facilities',
      ),
    enabled: can('facility:read'),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/tenant', {
        name: name.trim(),
        settings: { ...(context?.tenant?.settings ?? {}), prescriptionHeader: prescriptionHeader.trim() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me-context'] });
      await refresh();
      toast.success('Organização atualizada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2 md:gap-5">
      <Card>
        <CardHeader title="Dados da organização" />
        <div className="space-y-3 px-4 py-4">
          <Field label="Nome">
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!can('tenant:update')} />
          </Field>
          <Field
            label="Cabeçalho da receita"
            hint="Endereço, telefone e registro que aparecem no rodapé dos documentos."
          >
            <Textarea
              value={prescriptionHeader}
              onChange={(event) => setPrescriptionHeader(event.target.value)}
              rows={3}
              disabled={!can('tenant:update')}
            />
          </Field>
          {can('tenant:update') && (
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
              Salvar
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Unidades" />
        <ul className="divide-y divide-[var(--border)]">
          {(facilities?.items ?? []).map((facility) => (
            <li key={facility.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14.5px] font-medium text-[var(--ink)]">{facility.name}</span>
                {facility.isDefault && <Badge tone="brand">Padrão</Badge>}
              </div>
              <p className="text-[12.5px] text-[var(--ink-3)]">
                {[facility.code, facility.phone, facility.timezone].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ModulesPanel() {
  const queryClient = useQueryClient();
  const { can, refresh } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.get<{ items: Entitlement[] }>('/entitlements'),
  });

  const mutation = useMutation({
    mutationFn: ({ moduleKey, state }: { moduleKey: string; state: 'active' | 'disabled' }) =>
      api.put(`/entitlements/${moduleKey}`, { state }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] });
      await refresh();
      toast.success('Módulo atualizado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading) return <Card><ListSkeleton rows={6} /></Card>;

  const byKey = new Map((data?.items ?? []).map((item) => [item.moduleKey, item]));

  return (
    <Card>
      <CardHeader
        title="Módulos habilitados"
        description="O módulo desligado bloqueia a rota no servidor, não apenas o menu."
      />
      <ul className="divide-y divide-[var(--border)]">
        {MODULES.map((module) => {
          const entitlement = byKey.get(module.key);
          const state = entitlement?.state ?? 'disabled';
          const enabled = state === 'active' || state === 'trial';

          return (
            <li key={module.key} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-medium text-[var(--ink)]">{module.name}</span>
                  {module.alwaysOn && <Badge tone="muted">Sempre ativo</Badge>}
                  {state === 'suspended' && <Badge tone="warning">Suspenso</Badge>}
                  {state === 'trial' && <Badge tone="info">Avaliação</Badge>}
                </div>
                {module.dependsOn.length > 0 && (
                  <p className="text-[12.5px] text-[var(--ink-3)]">
                    Depende de {module.dependsOn.map((key) => MODULES.find((m) => m.key === key)?.name ?? key).join(', ')}
                  </p>
                )}
              </div>

              {can('tenant:update') && !module.alwaysOn && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${module.name}`}
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ moduleKey: module.key, state: enabled ? 'disabled' : 'active' })
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    enabled ? 'bg-[var(--brand)]' : 'bg-[var(--border-strong)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
