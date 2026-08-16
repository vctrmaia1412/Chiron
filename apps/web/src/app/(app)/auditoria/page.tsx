'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/field';
import { Tabs } from '@/components/ui/tabs';

interface AuditEntry {
  id: string;
  occurredAt: string;
  actorName: string | null;
  actorType: string;
  category: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
}

interface AccessEntry {
  id: string;
  occurredAt: string;
  actorName: string | null;
  patientName: string | null;
  resource: string;
  purpose: string | null;
  ip: string | null;
}

const CATEGORY_LABEL: Record<string, { label: string; tone: 'neutral' | 'brand' | 'danger' | 'warning' | 'info' }> = {
  mutation: { label: 'Alteração', tone: 'neutral' },
  sign: { label: 'Assinatura', tone: 'brand' },
  cancel: { label: 'Cancelamento', tone: 'warning' },
  reopen: { label: 'Reabertura', tone: 'warning' },
  merge: { label: 'Unificação', tone: 'neutral' },
  authz_change: { label: 'Permissão', tone: 'info' },
  entitlement_change: { label: 'Módulo', tone: 'info' },
  access_denied: { label: 'Acesso negado', tone: 'danger' },
  export: { label: 'Exportação', tone: 'warning' },
  auth: { label: 'Autenticação', tone: 'neutral' },
  impersonation: { label: 'Suporte', tone: 'danger' },
  context_switch: { label: 'Troca de contexto', tone: 'neutral' },
};

const RESOURCE_LABEL: Record<string, string> = {
  encounter: 'Atendimento',
  record: 'Prontuário',
  timeline: 'Linha do tempo',
  document: 'Documento',
  invoice: 'Cobrança',
  export: 'Exportação',
  search: 'Busca',
};

export default function AuditPage() {
  const [tab, setTab] = useState<'acoes' | 'acessos'>('acoes');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');

  const audit = useQuery({
    queryKey: ['audit', category, from],
    queryFn: () =>
      api.get<{ items: AuditEntry[] }>('/audit', {
        category: category || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        limit: 100,
      }),
    enabled: tab === 'acoes',
  });

  const access = useQuery({
    queryKey: ['audit', 'access', from],
    queryFn: () =>
      api.get<{ items: AccessEntry[] }>('/audit/access', {
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        limit: 100,
      }),
    enabled: tab === 'acessos',
  });

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Trilha de alterações e histórico de acesso a dado sensível. Os registros são somente leitura."
      />

      <Tabs
        className="mb-3"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'acoes', label: 'Ações' },
          { key: 'acessos', label: 'Acessos a prontuário' },
        ]}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="sm:w-44" />
        {tab === 'acoes' && (
          <Select value={category} onChange={(event) => setCategory(event.target.value)} className="sm:w-56">
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORY_LABEL).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Card>
        {tab === 'acoes' ? (
          audit.error ? (
            <ErrorState message={errorMessage(audit.error)} onRetry={() => void audit.refetch()} />
          ) : audit.isLoading ? (
            <ListSkeleton rows={8} />
          ) : (audit.data?.items ?? []).length === 0 ? (
            <EmptyState icon={<ScrollText className="h-7 w-7" />} title="Nenhum registro no período" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {(audit.data?.items ?? []).map((entry) => {
                const meta = CATEGORY_LABEL[entry.category] ?? { label: entry.category, tone: 'neutral' as const };
                return (
                  <li key={entry.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-mono text-[12.5px] text-[var(--ink-2)]">{entry.action}</span>
                      <span className="ml-auto text-[12px] tabular text-[var(--ink-3)]">
                        {formatDateTime(entry.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
                      {[entry.actorName ?? 'Sistema', entry.entity, entry.ip].filter(Boolean).join(' · ')}
                    </p>
                    {entry.reason && <p className="text-[12.5px] text-[var(--ink-2)]">Motivo: {entry.reason}</p>}
                  </li>
                );
              })}
            </ul>
          )
        ) : access.error ? (
          <ErrorState message={errorMessage(access.error)} onRetry={() => void access.refetch()} />
        ) : access.isLoading ? (
          <ListSkeleton rows={8} />
        ) : (access.data?.items ?? []).length === 0 ? (
          <EmptyState icon={<ScrollText className="h-7 w-7" />} title="Nenhum acesso registrado no período" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {(access.data?.items ?? []).map((entry) => (
              <li key={entry.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{RESOURCE_LABEL[entry.resource] ?? entry.resource}</Badge>
                  <span className="text-[13.5px] text-[var(--ink)]">{entry.patientName ?? 'Sem paciente'}</span>
                  <span className="ml-auto text-[12px] tabular text-[var(--ink-3)]">
                    {formatDateTime(entry.occurredAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
                  {[entry.actorName ?? 'Sistema', entry.purpose, entry.ip].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
