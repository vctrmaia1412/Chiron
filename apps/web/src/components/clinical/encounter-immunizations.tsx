'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Syringe } from 'lucide-react';
import type { Immunization, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, formatDate, formatDateTime, toIsoDate } from '@/lib/format';
import { ROUTE, labelFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select, Textarea } from '@/components/ui/field';

export function EncounterImmunizations({
  encounterId,
  patientId,
  writable,
}: {
  encounterId: string;
  patientId: string;
  writable: boolean;
}) {
  const { can } = useSession();
  const [vaccineOpen, setVaccineOpen] = useState(false);
  const [preventiveOpen, setPreventiveOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['immunizations', encounterId],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', {
        encounterId,
        limit: 50,
      }),
  });

  const immunizations = data?.immunizations ?? [];
  const preventives = data?.preventives ?? [];
  const empty = immunizations.length === 0 && preventives.length === 0;

  return (
    <>
      <Card>
        <CardHeader
          title="Vacinas e preventivos"
          action={
            writable && can('immunization:apply') ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPreventiveOpen(true)}>
                  Vermífugo
                </Button>
                <Button size="sm" onClick={() => setVaccineOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Vacina
                </Button>
              </div>
            ) : undefined
          }
        />

        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : empty ? (
          <EmptyState
            icon={<Syringe className="h-7 w-7" />}
            title="Nenhuma aplicação neste atendimento"
            description="As aplicações entram na carteira do paciente e geram a pendência da próxima dose."
            action={
              writable && can('immunization:apply') ? (
                <Button onClick={() => setVaccineOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Registrar vacina
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {immunizations.map((immunization) => (
              <li key={immunization.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-medium text-[var(--ink)]">{immunization.vaccineName}</span>
                  {immunization.status !== 'completed' && <Badge tone="muted">Cancelada</Badge>}
                  {immunization.nextDueAt && (
                    <Badge tone="info">Próxima dose {formatDate(immunization.nextDueAt)}</Badge>
                  )}
                </div>
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {[
                    formatDateTime(immunization.administeredAt),
                    immunization.manufacturer,
                    immunization.lotNumber ? `lote ${immunization.lotNumber}` : null,
                    immunization.route ? labelFor(ROUTE, immunization.route) : null,
                    immunization.professionalName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {immunization.reactionNotes && (
                  <p className="mt-0.5 text-[13px] text-[var(--warning)]">{immunization.reactionNotes}</p>
                )}
              </li>
            ))}

            {preventives.map((preventive) => (
              <li key={preventive.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-medium text-[var(--ink)]">{preventive.productName}</span>
                  <Badge tone="neutral">
                    {preventive.kind === 'deworming' ? 'Vermífugo' : preventive.kind === 'ectoparasite' ? 'Antiparasitário' : 'Preventivo'}
                  </Badge>
                  {preventive.nextDueAt && <Badge tone="info">Próxima {formatDate(preventive.nextDueAt)}</Badge>}
                </div>
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {[formatDateTime(preventive.administeredAt), preventive.doseText, preventive.professionalName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <VaccineSheet
        open={vaccineOpen}
        onOpenChange={setVaccineOpen}
        encounterId={encounterId}
        patientId={patientId}
      />
      <PreventiveSheet
        open={preventiveOpen}
        onOpenChange={setPreventiveOpen}
        encounterId={encounterId}
        patientId={patientId}
      />
    </>
  );
}

export function VaccineSheet({
  open,
  onOpenChange,
  encounterId,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const [vaccineName, setVaccineName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [route, setRoute] = useState('sc');
  const [site, setSite] = useState('');
  const [doseNumber, setDoseNumber] = useState('');
  const [nextDueAt, setNextDueAt] = useState(toIsoDate(addDays(new Date(), 365)));
  const [reactionNotes, setReactionNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setVaccineName('');
    setManufacturer('');
    setLotNumber('');
    setExpiresAt('');
    setRoute('sc');
    setSite('');
    setDoseNumber('');
    setNextDueAt(toIsoDate(addDays(new Date(), 365)));
    setReactionNotes('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/immunizations', {
        patientId,
        encounterId,
        vaccineName: vaccineName.trim(),
        manufacturer: manufacturer.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        expiresAt: expiresAt || undefined,
        route,
        site: site.trim() || undefined,
        doseNumber: doseNumber ? Number(doseNumber) : undefined,
        nextDueAt: nextDueAt || undefined,
        reactionNotes: reactionNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['immunizations'] });
      await queryClient.invalidateQueries({ queryKey: ['timeline', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Vacina registrada.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar vacina"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (vaccineName.trim().length < 2) {
                toast.error('Informe a vacina.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Vacina" required>
          <Input
            autoFocus
            value={vaccineName}
            onChange={(event) => setVaccineName(event.target.value)}
            placeholder="Ex.: V10 (polivalente canina)"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fabricante">
            <Input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
          </Field>
          <Field label="Lote">
            <Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
          </Field>
          <Field label="Validade do frasco">
            <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </Field>
          <Field label="Dose número">
            <Input
              value={doseNumber}
              onChange={(event) => setDoseNumber(event.target.value)}
              inputMode="numeric"
              placeholder="1, 2, 3"
            />
          </Field>
          <Field label="Via">
            <Select value={route} onChange={(event) => setRoute(event.target.value)}>
              {Object.entries(ROUTE).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Local de aplicação">
            <Input value={site} onChange={(event) => setSite(event.target.value)} placeholder="Região escapular" />
          </Field>
        </div>

        <Field label="Próxima dose" hint="Gera a pendência que aparece no painel e na lista de vacinas.">
          <Input type="date" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} />
        </Field>

        <Field label="Reação observada">
          <Textarea value={reactionNotes} onChange={(event) => setReactionNotes(event.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}

function PreventiveSheet({
  open,
  onOpenChange,
  encounterId,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const [productName, setProductName] = useState('');
  const [kind, setKind] = useState<'deworming' | 'ectoparasite' | 'other'>('deworming');
  const [doseText, setDoseText] = useState('');
  const [nextDueAt, setNextDueAt] = useState(toIsoDate(addDays(new Date(), 90)));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setProductName('');
    setKind('deworming');
    setDoseText('');
    setNextDueAt(toIsoDate(addDays(new Date(), 90)));
    setNotes('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/immunizations/preventives', {
        patientId,
        encounterId,
        kind,
        productName: productName.trim(),
        doseText: doseText.trim() || undefined,
        nextDueAt: nextDueAt || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['immunizations'] });
      await queryClient.invalidateQueries({ queryKey: ['timeline', patientId] });
      toast.success('Preventivo registrado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar preventivo"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (productName.trim().length < 2) {
                toast.error('Informe o produto.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="deworming">Vermífugo</option>
            <option value="ectoparasite">Antiparasitário externo</option>
            <option value="other">Outro preventivo</option>
          </Select>
        </Field>
        <Field label="Produto" required>
          <Input autoFocus value={productName} onChange={(event) => setProductName(event.target.value)} />
        </Field>
        <Field label="Dose">
          <Input
            value={doseText}
            onChange={(event) => setDoseText(event.target.value)}
            placeholder="Ex.: 1 comprimido por 10 kg"
          />
        </Field>
        <Field label="Próxima aplicação">
          <Input type="date" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} />
        </Field>
        <Field label="Observações">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}
