'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Syringe } from 'lucide-react';
import type { Immunization, PatientProtocolSuggestion, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, formatDate, formatDateTime, toIsoDate } from '@/lib/format';
import { ROUTE, labelFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { useVaccineProtocols } from '@/lib/charting';
import { cn } from '@/lib/cn';
import { Badge, Card, CardHeader, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

export function EncounterImmunizations({
  encounterId,
  patientId,
  writable,
  vaccineOpen: controlledOpen,
  onVaccineOpenChange,
}: {
  encounterId: string;
  patientId: string;
  writable: boolean;
  /** Aberto de fora, pela barra de ações do celular. */
  vaccineOpen?: boolean;
  onVaccineOpenChange?: (open: boolean) => void;
}) {
  const { can } = useSession();
  const [internalOpen, setInternalOpen] = useState(false);
  const vaccineOpen = controlledOpen ?? internalOpen;
  const setVaccineOpen = onVaccineOpenChange ?? setInternalOpen;
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
          <p className="flex items-center gap-2 px-4 py-3.5 text-[13.5px] text-[var(--ink-3)]">
            <Syringe className="h-4 w-4" />
            Nenhuma aplicação neste atendimento.
          </p>
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

function VaccineSheetContent({
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
  const { data: protocols = [] } = useVaccineProtocols(patientId, open);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [vaccineName, setVaccineName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [route, setRoute] = useState('sc');
  const [site, setSite] = useState('');
  const [doseNumber, setDoseNumber] = useState('');
  const [nextDueAt, setNextDueAt] = useState(toIsoDate(addDays(new Date(), 365)));
  const [reactionNotes, setReactionNotes] = useState('');
  const [lotFromHistory, setLotFromHistory] = useState(false);
  const [showMore, setShowMore] = useState(false);

  /** Protocolo escolhido preenche tudo o que já se sabe; o lote vem do frasco em uso na clínica. */
  function pickProtocol(protocol: PatientProtocolSuggestion) {
    setProtocolId(protocol.id);
    setVaccineName(protocol.name);
    setDoseNumber(String(protocol.nextDoseNumber));
    setNextDueAt(protocol.suggestedNextDueAt ?? '');
    setManufacturer(protocol.lot?.manufacturer ?? '');
    setLotNumber(protocol.lot?.lotNumber ?? '');
    setExpiresAt(protocol.lot?.expiresAt ?? '');
    setLotFromHistory(Boolean(protocol.lot?.lotNumber));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/immunizations', {
        patientId,
        encounterId,
        protocolId: protocolId ?? undefined,
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
      await queryClient.invalidateQueries({ queryKey: ['vaccine-protocols', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['patient-summary', patientId] });
      toast.success('Vacina registrada. A próxima dose já está na lista de pendências.');
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
      <div className="space-y-4">
        {protocols.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--ink-2)]">Protocolos para a espécie</p>
            <div className="flex flex-wrap gap-1.5">
              {protocols.map((protocol) => (
                <button
                  key={protocol.id}
                  type="button"
                  aria-pressed={protocolId === protocol.id}
                  onClick={() => pickProtocol(protocol)}
                  className={cn(
                    'rounded-[var(--radius)] border px-3 py-2 text-left transition-colors',
                    protocolId === protocol.id
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                      : 'border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="block text-[13.5px] font-medium text-[var(--ink)]">{protocol.name}</span>
                  <span className="block text-[12px] text-[var(--ink-3)]">
                    {protocol.nextDoseLabel}
                    {protocol.dosesGiven > 0
                      ? ` · ${protocol.dosesGiven} já aplicada${protocol.dosesGiven > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Vacina" required htmlFor="vaccine-name">
          <Input
            id="vaccine-name"
            value={vaccineName}
            onChange={(event) => {
              setVaccineName(event.target.value);
              setProtocolId(null);
            }}
            placeholder="Ex.: V10 (polivalente canina)"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dose nº" htmlFor="vaccine-dose">
            <Input
              id="vaccine-dose"
              value={doseNumber}
              onChange={(event) => setDoseNumber(event.target.value)}
              inputMode="numeric"
              placeholder="1, 2, 3"
            />
          </Field>
          <Field label="Próxima dose" htmlFor="vaccine-next">
            <Input
              id="vaccine-next"
              type="date"
              value={nextDueAt}
              onChange={(event) => setNextDueAt(event.target.value)}
            />
          </Field>
        </div>

        {lotFromHistory ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5">
            <p className="text-[13px] text-[var(--ink-2)]">
              Frasco em uso: <strong className="text-[var(--ink)]">{manufacturer || 'fabricante não informado'}</strong>
              {` · lote ${lotNumber}`}
              {expiresAt ? ` · val. ${formatDate(expiresAt)}` : ''}
            </p>
            <button
              type="button"
              onClick={() => setLotFromHistory(false)}
              className="shrink-0 text-[12.5px] font-medium text-[var(--brand)]"
            >
              Outro frasco
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Fabricante" htmlFor="vaccine-manufacturer" className="col-span-2 sm:col-span-1">
              <Input
                id="vaccine-manufacturer"
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
              />
            </Field>
            <Field label="Lote" htmlFor="vaccine-lot">
              <Input id="vaccine-lot" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
            </Field>
            <Field label="Validade" htmlFor="vaccine-expiry">
              <Input
                id="vaccine-expiry"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </Field>
          </div>
        )}

        {showMore ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Via" htmlFor="vaccine-route">
                <Select id="vaccine-route" value={route} onChange={(event) => setRoute(event.target.value)}>
                  {Object.entries(ROUTE).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Local de aplicação" htmlFor="vaccine-site">
                <Input
                  id="vaccine-site"
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  placeholder="Região escapular"
                />
              </Field>
            </div>
            <Field label="Reação observada" htmlFor="vaccine-reaction">
              <Textarea
                id="vaccine-reaction"
                value={reactionNotes}
                onChange={(event) => setReactionNotes(event.target.value)}
                rows={2}
              />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-[13px] font-medium text-[var(--brand)]"
          >
            + Via ({labelFor(ROUTE, route)}), local e reação
          </button>
        )}
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

export function VaccineSheet(props: React.ComponentProps<typeof VaccineSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <VaccineSheetContent {...props} />
    </MountWhenOpen>
  );
}
