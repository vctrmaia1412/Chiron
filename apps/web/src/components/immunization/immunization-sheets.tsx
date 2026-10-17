'use client';

import { useState } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PatientProtocolSuggestion, PreventiveKind } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, formatDate, toIsoDate } from '@/lib/format';
import { ROUTE, labelFor } from '@/lib/labels';
import { useVaccineProtocols } from '@/lib/charting';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

export const PREVENTIVE_KIND_LABEL: Record<PreventiveKind, string> = {
  deworming: 'Vermífugo',
  ectoparasite: 'Antipulgas e carrapatos',
  other: 'Outro preventivo',
};

/** Tudo o que mostra vacina, pendência ou carteira do paciente se atualiza junto. */
export async function refreshImmunizationViews(queryClient: QueryClient, patientId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['immunizations'] }),
    queryClient.invalidateQueries({ queryKey: ['timeline', patientId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['vaccine-protocols', patientId] }),
    queryClient.invalidateQueries({ queryKey: ['patient-summary', patientId] }),
  ]);
}

/**
 * Dia escolhido num campo de data vira instante. Hoje vale "agora" (meio-dia
 * ainda pode estar no futuro e o servidor recusa); outro dia vai ao meio-dia
 * local, longe da virada que trocaria a data em UTC.
 */
export function dayToInstant(day: string): string {
  if (day === toIsoDate(new Date())) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

/**
 * "Aplicada aqui" ou "em outro local". A dose de fora (carteira trazida pelo
 * tutor) não pede lote, não tem profissional da casa e nunca entra no
 * atendimento: vai direto para a carteira.
 */
function WhereApplied({
  elsewhere,
  onChange,
  inEncounter,
}: {
  elsewhere: boolean;
  onChange: (elsewhere: boolean) => void;
  inEncounter: boolean;
}) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Onde a dose foi aplicada"
        className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-[var(--surface-2)] p-1"
      >
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={elsewhere === value}
            onClick={() => onChange(value)}
            className={cn(
              'h-10 rounded-[calc(var(--radius)-2px)] px-2 text-[13.5px] font-medium transition-colors',
              elsewhere === value
                ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
            )}
          >
            {value ? 'Em outro local' : 'Aplicada aqui'}
          </button>
        ))}
      </div>
      {elsewhere && (
        <p className="mt-1.5 text-[12.5px] text-[var(--ink-3)]">
          {inEncounter
            ? 'Histórico trazido pelo tutor: vai para a carteira do paciente, fora deste atendimento.'
            : 'Histórico trazido pelo tutor: copie a data e a próxima dose da carteira.'}
        </p>
      )}
    </div>
  );
}

function VaccineSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
  initialVaccineName = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
  /** Vindo da lista de pendências: a dose seguinte da mesma vacina. */
  initialVaccineName?: string;
}) {
  const queryClient = useQueryClient();
  const { data: protocols = [] } = useVaccineProtocols(patientId, open);
  const today = toIsoDate(new Date());
  const defaultNext = toIsoDate(addDays(new Date(), 365));
  const [elsewhere, setElsewhere] = useState(false);
  const [administeredDay, setAdministeredDay] = useState('');
  const [externalLocation, setExternalLocation] = useState('');
  const [externalProfessional, setExternalProfessional] = useState('');
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [vaccineName, setVaccineName] = useState(initialVaccineName);
  const [manufacturer, setManufacturer] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [route, setRoute] = useState('sc');
  const [site, setSite] = useState('');
  const [doseNumber, setDoseNumber] = useState('');
  const [nextDueAt, setNextDueAt] = useState(defaultNext);
  const [reactionNotes, setReactionNotes] = useState('');
  const [lotFromHistory, setLotFromHistory] = useState(false);
  const [showMore, setShowMore] = useState(false);

  function switchWhere(next: boolean) {
    setElsewhere(next);
    // A sugestão de "um ano a partir de hoje" não serve para dose antiga, e o
    // frasco em uso na clínica não é o que foi aplicado fora.
    if (next) {
      if (nextDueAt === defaultNext) setNextDueAt('');
      if (lotFromHistory) {
        setLotFromHistory(false);
        setManufacturer('');
        setLotNumber('');
        setExpiresAt('');
      }
    } else if (!nextDueAt) {
      setNextDueAt(defaultNext);
    }
  }

  /** Protocolo escolhido preenche tudo o que já se sabe; o lote vem do frasco em uso na clínica. */
  function pickProtocol(protocol: PatientProtocolSuggestion) {
    setProtocolId(protocol.id);
    setVaccineName(protocol.name);
    setDoseNumber(String(protocol.nextDoseNumber));
    if (elsewhere) return;
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
        encounterId: elsewhere ? undefined : encounterId,
        protocolId: protocolId ?? undefined,
        vaccineName: vaccineName.trim(),
        manufacturer: manufacturer.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        expiresAt: expiresAt || undefined,
        route: elsewhere ? undefined : route,
        site: site.trim() || undefined,
        doseNumber: doseNumber ? Number(doseNumber) : undefined,
        nextDueAt: nextDueAt || undefined,
        reactionNotes: reactionNotes.trim() || undefined,
        administeredElsewhere: elsewhere || undefined,
        administeredAt: elsewhere ? dayToInstant(administeredDay) : undefined,
        externalLocation: elsewhere ? externalLocation.trim() || undefined : undefined,
        externalProfessional: elsewhere ? externalProfessional.trim() || undefined : undefined,
      }),
    onSuccess: async () => {
      await refreshImmunizationViews(queryClient, patientId);
      toast.success(
        elsewhere
          ? 'Dose de outro local registrada na carteira.'
          : nextDueAt
            ? 'Vacina registrada. A próxima dose já está na lista de pendências.'
            : 'Vacina registrada.',
      );
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit() {
    if (vaccineName.trim().length < 2) {
      toast.error('Informe a vacina.');
      return;
    }
    if (elsewhere && !administeredDay) {
      toast.error('Informe a data em que a dose foi aplicada.');
      return;
    }
    if (elsewhere && administeredDay > today) {
      toast.error('A data de aplicação não pode estar no futuro.');
      return;
    }
    if (doseNumber && !/^\d{1,2}$/.test(doseNumber.trim())) {
      toast.error('Dose nº deve ser um número, como 1, 2 ou 3.');
      return;
    }
    mutation.mutate();
  }

  const lotFields = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field label="Fabricante" htmlFor="vaccine-manufacturer" className="col-span-2 sm:col-span-1">
        <Input id="vaccine-manufacturer" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
      </Field>
      <Field label="Lote" htmlFor="vaccine-lot">
        <Input id="vaccine-lot" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
      </Field>
      <Field label="Validade" htmlFor="vaccine-expiry">
        <Input id="vaccine-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
      </Field>
    </div>
  );

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
          <Button onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <WhereApplied elsewhere={elsewhere} onChange={switchWhere} inEncounter={Boolean(encounterId)} />

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

        {elsewhere && (
          <Field label="Aplicada em" required htmlFor="vaccine-administered" hint="Como consta na carteira.">
            <Input
              id="vaccine-administered"
              type="date"
              max={today}
              value={administeredDay}
              onChange={(event) => setAdministeredDay(event.target.value)}
            />
          </Field>
        )}

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
            <Input id="vaccine-next" type="date" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} />
          </Field>
        </div>

        {elsewhere ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Onde foi aplicada" htmlFor="vaccine-where">
                <Input
                  id="vaccine-where"
                  value={externalLocation}
                  onChange={(event) => setExternalLocation(event.target.value)}
                  placeholder="Clínica, campanha ou cidade"
                />
              </Field>
              <Field label="Aplicada por" htmlFor="vaccine-who">
                <Input
                  id="vaccine-who"
                  value={externalProfessional}
                  onChange={(event) => setExternalProfessional(event.target.value)}
                  placeholder="Nome e CRMV, se constar"
                />
              </Field>
            </div>
            {showMore ? (
              lotFields
            ) : (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className="min-h-10 text-[13px] font-medium text-[var(--brand)]"
              >
                + Fabricante e lote (se constar na carteira)
              </button>
            )}
          </>
        ) : (
          <>
            {lotFromHistory ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="min-w-0 text-[13px] text-[var(--ink-2)]">
                  Frasco em uso:{' '}
                  <strong className="text-[var(--ink)]">{manufacturer || 'fabricante não informado'}</strong>
                  {` · lote ${lotNumber}`}
                  {expiresAt ? ` · val. ${formatDate(expiresAt)}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setLotFromHistory(false)}
                  className="min-h-10 shrink-0 text-[12.5px] font-medium text-[var(--brand)]"
                >
                  Outro frasco
                </button>
              </div>
            ) : (
              lotFields
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
                className="min-h-10 text-[13px] font-medium text-[var(--brand)]"
              >
                + Via ({labelFor(ROUTE, route)}), local e reação
              </button>
            )}
          </>
        )}
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

function PreventiveSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
  initialKind = 'deworming',
  initialProductName = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
  initialKind?: PreventiveKind;
  initialProductName?: string;
}) {
  const queryClient = useQueryClient();
  const today = toIsoDate(new Date());
  const defaultNext = toIsoDate(addDays(new Date(), 90));
  const [elsewhere, setElsewhere] = useState(false);
  const [administeredDay, setAdministeredDay] = useState('');
  const [externalLocation, setExternalLocation] = useState('');
  const [externalProfessional, setExternalProfessional] = useState('');
  const [productName, setProductName] = useState(initialProductName);
  const [kind, setKind] = useState<PreventiveKind>(initialKind);
  const [doseText, setDoseText] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [nextDueAt, setNextDueAt] = useState(defaultNext);
  const [notes, setNotes] = useState('');

  function switchWhere(next: boolean) {
    setElsewhere(next);
    if (next && nextDueAt === defaultNext) setNextDueAt('');
    if (!next && !nextDueAt) setNextDueAt(defaultNext);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/immunizations/preventives', {
        patientId,
        encounterId: elsewhere ? undefined : encounterId,
        kind,
        productName: productName.trim(),
        doseText: doseText.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        nextDueAt: nextDueAt || undefined,
        notes: notes.trim() || undefined,
        administeredElsewhere: elsewhere || undefined,
        administeredAt: elsewhere ? dayToInstant(administeredDay) : undefined,
        externalLocation: elsewhere ? externalLocation.trim() || undefined : undefined,
        externalProfessional: elsewhere ? externalProfessional.trim() || undefined : undefined,
      }),
    onSuccess: async () => {
      await refreshImmunizationViews(queryClient, patientId);
      toast.success(elsewhere ? 'Aplicação de outro local registrada na carteira.' : 'Preventivo registrado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit() {
    if (productName.trim().length < 2) {
      toast.error('Informe o produto.');
      return;
    }
    if (elsewhere && !administeredDay) {
      toast.error('Informe a data em que foi aplicado.');
      return;
    }
    if (elsewhere && administeredDay > today) {
      toast.error('A data de aplicação não pode estar no futuro.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar preventivo"
      description="Vermífugo, antipulgas e carrapatos ou outro preventivo."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <WhereApplied elsewhere={elsewhere} onChange={switchWhere} inEncounter={Boolean(encounterId)} />
        <Field label="Tipo">
          <Select value={kind} onChange={(event) => setKind(event.target.value as PreventiveKind)}>
            {Object.entries(PREVENTIVE_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Produto" required>
          <Input value={productName} onChange={(event) => setProductName(event.target.value)} />
        </Field>
        {elsewhere && (
          <Field label="Aplicado em" required hint="Como consta na carteira ou na embalagem.">
            <Input
              type="date"
              max={today}
              value={administeredDay}
              onChange={(event) => setAdministeredDay(event.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dose">
            <Input value={doseText} onChange={(event) => setDoseText(event.target.value)} placeholder="1 comprimido" />
          </Field>
          <Field label="Lote">
            <Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
          </Field>
        </div>
        <Field label="Próxima aplicação">
          <Input type="date" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} />
        </Field>
        {elsewhere && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Onde foi aplicado">
              <Input
                value={externalLocation}
                onChange={(event) => setExternalLocation(event.target.value)}
                placeholder="Clínica, pet shop, em casa"
              />
            </Field>
            <Field label="Aplicado por">
              <Input value={externalProfessional} onChange={(event) => setExternalProfessional(event.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Observações">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}

export function PreventiveSheet(props: React.ComponentProps<typeof PreventiveSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <PreventiveSheetContent {...props} />
    </MountWhenOpen>
  );
}
