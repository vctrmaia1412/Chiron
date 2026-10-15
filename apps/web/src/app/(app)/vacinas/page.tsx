'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Phone, Plus, Search, Syringe } from 'lucide-react';
import type { DueItem, Immunization, PreventiveKind, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, formatDate, formatPhone, toIsoDate, whatsappLink } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { Input } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';
import { PatientPicker, type PatientPickerValue } from '@/components/patients/patient-picker';
import { AppliedRecordList, mergeRecords } from '@/components/immunization/applied-records';
import { PreventiveSheet, VaccineSheet } from '@/components/immunization/immunization-sheets';

const PAGE = 20;

function plain(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** O que abrir depois de escolher o paciente (ou tocar numa pendência). */
type RegisterTarget =
  | { type: 'vaccine'; patientId: string; vaccineName?: string }
  | { type: 'preventive'; patientId: string; kind?: PreventiveKind; productName?: string };

function ImmunizationsView() {
  const params = useSearchParams();
  const { can } = useSession();
  const [tab, setTab] = useState<'pendentes' | 'aplicadas'>(params.get('aplicadas') ? 'aplicadas' : 'pendentes');
  const [horizon, setHorizon] = useState(30);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [pickOpen, setPickOpen] = useState(false);
  const [target, setTarget] = useState<RegisterTarget | null>(null);

  const canVaccine = can('immunization:apply');
  const canPreventive = can('preventive:record');

  const due = useQuery({
    queryKey: ['immunizations', 'due', horizon],
    queryFn: () =>
      api.get<{ items: DueItem[] }>('/immunizations/due', {
        until: toIsoDate(addDays(new Date(), horizon)),
        limit: 100,
      }),
    enabled: tab === 'pendentes',
  });

  const applied = useQuery({
    queryKey: ['immunizations', 'applied'],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', { limit: 60 }),
    enabled: tab === 'aplicadas',
  });

  const query = plain(search.trim());
  const dueItems = (due.data?.items ?? []).filter(
    (item) =>
      !query || plain(item.patientName).includes(query) || plain(item.guardianName ?? '').includes(query),
  );
  const appliedRecords = mergeRecords(applied.data);

  /** A próxima dose da pendência: mesma vacina ou mesmo produto, já no tipo certo. */
  function registerFrom(item: DueItem) {
    setTarget(
      item.kind === 'vaccine'
        ? { type: 'vaccine', patientId: item.patientId, vaccineName: item.productName }
        : {
            type: 'preventive',
            patientId: item.patientId,
            kind: item.preventiveKind ?? undefined,
            productName: item.productName,
          },
    );
  }

  function closeTarget(open: boolean) {
    if (!open) setTarget(null);
  }

  return (
    <>
      <PageHeader
        title="Vacinas e preventivos"
        description="Pendências de próxima dose e histórico de aplicações."
        actions={
          canVaccine || canPreventive ? (
            <Button size="sm" onClick={() => setPickOpen(true)}>
              <Plus className="h-4 w-4" />
              Registrar aplicação
            </Button>
          ) : undefined
        }
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'pendentes', label: 'Pendentes', count: due.data?.items.length },
          { key: 'aplicadas', label: 'Aplicadas' },
        ]}
      />

      {tab === 'pendentes' && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisible(PAGE);
            }}
            placeholder="Buscar paciente ou tutor"
            aria-label="Buscar paciente ou tutor"
            className="pl-9"
          />
        </div>
      )}

      {tab === 'pendentes' ? (
        <Card>
          <CardHeader
            title="Doses a vencer"
            action={
              <div className="flex gap-1">
                {[15, 30, 60].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      setHorizon(days);
                      setVisible(PAGE);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium ${
                      horizon === days
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                        : 'text-[var(--ink-3)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {days} dias
                  </button>
                ))}
              </div>
            }
          />
          {due.error ? (
            <ErrorState message={errorMessage(due.error)} onRetry={() => void due.refetch()} />
          ) : due.isLoading ? (
            <ListSkeleton rows={5} />
          ) : dueItems.length === 0 ? (
            <EmptyState
              icon={<Syringe className="h-7 w-7" />}
              title={search.trim() ? 'Ninguém encontrado' : 'Nenhuma dose pendente'}
              description={search.trim() ? 'Confira o nome do paciente ou do tutor.' : `Nada vencendo nos próximos ${horizon} dias.`}
            />
          ) : (
            <>
            <ul className="divide-y divide-[var(--border)]">
              {dueItems.slice(0, visible).map((item) => {
                const overdue = new Date(`${item.dueAt}T12:00:00`) < new Date();
                const wa = whatsappLink(
                  item.guardianPhone,
                  `Olá! Aqui é da clínica. A ${item.productName} do ${item.patientName} está prevista para ${formatDate(item.dueAt)}. Podemos agendar?`,
                );
                const canRegister = item.kind === 'vaccine' ? canVaccine : canPreventive;
                return (
                  <li key={`${item.kind}-${item.id}`} className="px-4 py-3">
                    {/* No celular as ações descem para baixo do nome: lado a lado, o nome do paciente sumia. */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/pacientes/${item.patientId}`}
                            className="truncate text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                          >
                            {item.patientName}
                          </Link>
                          <Badge tone={overdue ? 'danger' : 'warning'}>
                            {overdue ? 'Vencida' : 'A vencer'} {formatDate(item.dueAt)}
                          </Badge>
                        </div>
                        <p className="text-[13px] leading-snug text-[var(--ink-2)]">{item.productName}</p>
                        {item.guardianName && (
                          <p className="text-[12.5px] leading-snug text-[var(--ink-3)]">
                            {item.guardianName}
                            {item.guardianPhone ? ` · ${formatPhone(item.guardianPhone)}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {canRegister && (
                          <Button
                            size="sm"
                            variant="subtle"
                            className="h-10"
                            onClick={() => registerFrom(item)}
                            aria-label={`Registrar aplicação de ${item.productName} em ${item.patientName}`}
                          >
                            <Syringe className="h-4 w-4" />
                            Registrar aplicação
                          </Button>
                        )}
                        <Link
                          href={`/agenda?novo=1&pacienteId=${item.patientId}`}
                          aria-label="Agendar aplicação"
                          title="Agendar aplicação"
                          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--ink-2)]"
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </Link>
                        {item.guardianPhone && (
                          <a
                            href={`tel:${item.guardianPhone.replace(/\D/g, '')}`}
                            aria-label="Ligar"
                            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--ink-2)]"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-10 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[12.5px] font-medium text-[var(--ink-2)]"
                          >
                            Avisar
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {dueItems.length > visible && (
              <div className="border-t border-[var(--border)] p-3">
                <Button variant="secondary" block onClick={() => setVisible((current) => current + PAGE)}>
                  Mostrar mais ({dueItems.length - visible})
                </Button>
              </div>
            )}
            </>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Aplicações registradas" />
          {applied.error ? (
            <ErrorState message={errorMessage(applied.error)} onRetry={() => void applied.refetch()} />
          ) : applied.isLoading ? (
            <ListSkeleton rows={5} />
          ) : appliedRecords.length === 0 ? (
            <EmptyState icon={<Syringe className="h-7 w-7" />} title="Nenhuma aplicação registrada" />
          ) : (
            <AppliedRecordList records={appliedRecords} showPatient />
          )}
        </Card>
      )}

      <PickPatientSheet
        open={pickOpen}
        onOpenChange={setPickOpen}
        canVaccine={canVaccine}
        canPreventive={canPreventive}
        onPick={(next) => {
          setPickOpen(false);
          setTarget(next);
        }}
      />
      {target?.type === 'vaccine' && (
        <VaccineSheet
          open
          onOpenChange={closeTarget}
          patientId={target.patientId}
          initialVaccineName={target.vaccineName}
        />
      )}
      {target?.type === 'preventive' && (
        <PreventiveSheet
          open
          onOpenChange={closeTarget}
          patientId={target.patientId}
          initialKind={target.kind}
          initialProductName={target.productName}
        />
      )}
    </>
  );
}

/**
 * Atalho do balcão: o tutor chega para o vermífugo ou traz a carteira de
 * outra clínica. Escolhe o animal e cai direto no registro, sem atendimento.
 */
function PickPatientSheetContent({
  open,
  onOpenChange,
  canVaccine,
  canPreventive,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canVaccine: boolean;
  canPreventive: boolean;
  onPick: (target: RegisterTarget) => void;
}) {
  const [patient, setPatient] = useState<PatientPickerValue | null>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar aplicação"
      description="Dose aplicada fora da consulta ou trazida na carteira do tutor."
      size="sm"
    >
      <div className="space-y-4">
        <PatientPicker value={patient} onChange={setPatient} />
        {patient && (
          <div className="grid gap-2 sm:grid-cols-2">
            {canVaccine && (
              <Button onClick={() => onPick({ type: 'vaccine', patientId: patient.id })}>
                <Syringe className="h-4 w-4" />
                Vacina
              </Button>
            )}
            {canPreventive && (
              <Button variant="secondary" onClick={() => onPick({ type: 'preventive', patientId: patient.id })}>
                Vermífugo ou antipulgas
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function PickPatientSheet(props: React.ComponentProps<typeof PickPatientSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <PickPatientSheetContent {...props} />
    </MountWhenOpen>
  );
}

export default function ImmunizationsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ImmunizationsView />
    </Suspense>
  );
}
