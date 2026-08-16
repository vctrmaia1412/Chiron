'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus } from 'lucide-react';
import type { ReferenceRange, Service, Species } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { SERVICE_CATEGORY, labelFor } from '@/lib/labels';
import { useServices, useSpecies } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { Tabs } from '@/components/ui/tabs';

export function CatalogPanel() {
  const [tab, setTab] = useState<'servicos' | 'referencias'>('servicos');

  return (
    <>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'servicos', label: 'Serviços' },
          { key: 'referencias', label: 'Faixas de referência' },
        ]}
      />
      {tab === 'servicos' ? <ServicesPanel /> : <ReferenceRangesPanel />}
    </>
  );
}

function ServicesPanel() {
  const { can } = useSession();
  const { data: services = [], isLoading } = useServices();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader
          title="Catálogo de serviços"
          description="Define duração padrão na agenda e o que entra na cobrança do atendimento."
          action={
            can('service:manage') ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Novo serviço
              </Button>
            ) : undefined
          }
        />
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : services.length === 0 ? (
          <EmptyState title="Nenhum serviço cadastrado" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {services.map((service) => (
              <li key={service.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-medium text-[var(--ink)]">{service.name}</span>
                    <Badge tone="neutral">{labelFor(SERVICE_CATEGORY, service.category)}</Badge>
                  </div>
                  <p className="text-[12.5px] text-[var(--ink-3)]">
                    {[
                      `${service.defaultDurationMin} min`,
                      service.defaultPrice ? formatMoney(service.defaultPrice) : null,
                      service.requiresProfessional ? 'exige profissional' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ServiceFormSheet open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}

function ServiceFormSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('consultation');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Service>('/services', {
        key: name
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 60),
        name: name.trim(),
        category,
        defaultDurationMin: Number(duration) || 30,
        defaultPrice: price.trim() ? Number(price.replace(',', '.')) : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'services'] });
      toast.success('Serviço criado.');
      setName('');
      setPrice('');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo serviço"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome" required>
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Categoria">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(SERVICE_CATEGORY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duração (min)">
            <Input value={duration} onChange={(event) => setDuration(event.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Preço padrão">
            <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Faixas de referência começam como informativas. A clínica valida cada uma
 * antes que o sistema passe a tratar o valor como parâmetro clínico, e não o
 * contrário.
 */
function ReferenceRangesPanel() {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { data: species = [] } = useSpecies();
  const [speciesId, setSpeciesId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reference-ranges', speciesId],
    queryFn: () => api.get<{ items: ReferenceRange[] }>('/reference-ranges', { speciesId: speciesId || undefined }),
    enabled: Boolean(speciesId),
  });

  const validate = useMutation({
    mutationFn: (id: string) => api.post(`/reference-ranges/${id}/validate`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reference-ranges'] });
      toast.success('Faixa validada. Passa a valer como parâmetro clínico.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader
        title="Faixas de referência"
        description="Enquanto não validada, a faixa aparece como indicação informativa nos sinais vitais."
      />
      <div className="px-4 py-3">
        <Select value={speciesId} onChange={(event) => setSpeciesId(event.target.value)} className="sm:w-64">
          <option value="">Escolha a espécie</option>
          {species.map((item: Species) => (
            <option key={item.id} value={item.id}>
              {item.namePt}
            </option>
          ))}
        </Select>
      </div>

      {!speciesId ? (
        <EmptyState title="Escolha uma espécie" description="As faixas variam por espécie e faixa etária." />
      ) : isLoading ? (
        <ListSkeleton rows={5} />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="Nenhuma faixa cadastrada para esta espécie" />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {(data?.items ?? []).map((range) => (
            <li key={range.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--ink)]">{range.parameterCode}</span>
                  <Badge tone={range.validationStatus === 'validated' ? 'success' : 'muted'}>
                    {range.validationStatus === 'validated' ? 'Validada' : 'Informativa'}
                  </Badge>
                  {range.isGlobal && <Badge tone="neutral">Padrão do sistema</Badge>}
                </div>
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {[
                    range.minValue && range.maxValue
                      ? `${formatNumber(range.minValue, 2)} a ${formatNumber(range.maxValue, 2)} ${range.uom}`
                      : null,
                    range.lifeStage,
                    range.source,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {can('catalog:manage') && range.validationStatus !== 'validated' && (
                <Button size="sm" variant="secondary" onClick={() => validate.mutate(range.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Validar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
