'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarPlus,
  FileText,
  Pencil,
  Phone,
  ScrollText,
  Stethoscope,
  Weight,
} from 'lucide-react';
import type { Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatPhone, formatWeight, whatsappLink } from '@/lib/format';
import {
  ALERT_KIND,
  GUARDIAN_ROLE,
  IDENTIFIER_SCHEME,
  PATIENT_STATUS,
  REPRODUCTIVE_STATUS,
  SEVERITY,
  SEX,
  labelFor,
  statusFor,
} from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, DataRow, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PatientFormSheet } from '@/components/patients/patient-form';
import { PatientTimeline } from '@/components/patients/patient-timeline';
import { WeightChart } from '@/components/patients/weight-chart';

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [allergyOpen, setAllergyOpen] = useState(false);

  const { data: patient, isLoading, error, refetch } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<Patient>(`/patients/${id}`),
  });

  if (error) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (isLoading || !patient) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const statusInfo = statusFor(PATIENT_STATUS, patient.status);
  const activeAlerts = patient.alerts.filter((alert) => alert.active);
  const activeAllergies = patient.allergies.filter((allergy) => allergy.status === 'active');

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/pacientes" className="hover:text-[var(--brand)]">
            Pacientes
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {patient.name}
            <span className="text-[13px] font-normal text-[var(--ink-3)] tabular">#{patient.number}</span>
            {patient.status !== 'active' && <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>}
          </span>
        }
        description={[
          patient.species.namePt,
          patient.breed?.name ?? patient.breedFreeText,
          patient.ageLabel,
          SEX[patient.sex],
          REPRODUCTIVE_STATUS[patient.reproductiveStatus],
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {can('patient:update') && (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {can('appointment:create') && patient.status === 'active' && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/agenda?novo=1&pacienteId=${patient.id}`}>
                  <CalendarPlus className="h-4 w-4" />
                  Agendar
                </Link>
              </Button>
            )}
            {can('record:read') && (
              <Button asChild size="sm">
                <Link href={`/pacientes/${patient.id}/prontuario`}>
                  <ScrollText className="h-4 w-4" />
                  Prontuário
                </Link>
              </Button>
            )}
          </>
        }
      />

      {(activeAlerts.length > 0 || activeAllergies.length > 0 || patient.status === 'deceased') && (
        <div className="mb-4 space-y-2">
          {patient.status === 'deceased' && (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2.5 text-[13.5px] text-[var(--danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Óbito registrado{patient.deceasedAt ? ` em ${formatDate(patient.deceasedAt)}` : ''}. O prontuário
                permanece disponível para consulta.
              </span>
            </div>
          )}
          {activeAllergies.map((allergy) => {
            const severity = statusFor(SEVERITY, allergy.severity);
            return (
              <div
                key={allergy.id}
                className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2.5 text-[13.5px] text-[var(--danger)]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="font-semibold">Alergia: {allergy.substance}</strong>
                  {allergy.reaction ? ` — ${allergy.reaction}` : ''} ({severity.label})
                </span>
              </div>
            );
          })}
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-2.5 text-[13.5px] text-[var(--warning)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">{labelFor(ALERT_KIND, alert.kind)}</strong> — {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] md:gap-5">
        <div className="space-y-4 md:space-y-5">
          <Card>
            <CardHeader
              title="Peso"
              action={
                can('patient:update') && patient.status === 'active' ? (
                  <Button variant="ghost" size="sm" onClick={() => setWeightOpen(true)}>
                    <Weight className="h-4 w-4" />
                    Registrar
                  </Button>
                ) : undefined
              }
            />
            <div className="px-4 py-3">
              <p className="text-[28px] font-semibold leading-none tabular text-[var(--ink)]">
                {formatWeight(patient.currentWeightKg) || 'Sem registro'}
              </p>
              {patient.currentWeightAt && (
                <p className="mt-1 text-[12.5px] text-[var(--ink-3)]">
                  Medido em {formatDateTime(patient.currentWeightAt)}
                </p>
              )}
              <WeightChart patientId={patient.id} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Tutores" />
            {patient.guardians.length === 0 ? (
              <EmptyState title="Sem tutor vinculado" description="Vincule um responsável ao paciente." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {patient.guardians.map((link) => {
                  const wa = whatsappLink(link.guardianPhone);
                  return (
                    <li key={link.guardianId} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/tutores/${link.guardianId}`}
                            className="block truncate text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                          >
                            {link.guardianName}
                          </Link>
                          <p className="text-[12.5px] text-[var(--ink-3)]">
                            {labelFor(GUARDIAN_ROLE, link.role)}
                            {link.isPrimary ? ' · principal' : ''}
                          </p>
                          {link.guardianPhone && (
                            <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">{formatPhone(link.guardianPhone)}</p>
                          )}
                        </div>
                        {link.guardianPhone && (
                          <div className="flex shrink-0 gap-1">
                            <a
                              href={`tel:${link.guardianPhone.replace(/\D/g, '')}`}
                              aria-label="Ligar"
                              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--ink-2)]"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="WhatsApp"
                                className="flex h-9 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[12.5px] font-medium text-[var(--ink-2)]"
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Cadastro" />
            <dl className="px-4 py-2">
              <DataRow label="Espécie" value={patient.species.namePt} />
              <DataRow label="Raça" value={patient.breed?.name ?? patient.breedFreeText} />
              {typeof patient.attributes?.scientificName === 'string' && (
                <DataRow label="Nome científico" value={<em>{patient.attributes.scientificName}</em>} />
              )}
              <DataRow label="Sexo" value={SEX[patient.sex]} />
              <DataRow label="Reprodutivo" value={REPRODUCTIVE_STATUS[patient.reproductiveStatus]} />
              <DataRow label="Nascimento" value={patient.birthDate ? formatDate(patient.birthDate) : null} />
              <DataRow label="Idade" value={patient.ageLabel} />
              <DataRow label="Pelagem" value={patient.colorMarkings} />
              <DataRow label="Código interno" value={patient.internalCode} />
              {patient.identifiers.map((identifier) => (
                <DataRow
                  key={identifier.id}
                  label={labelFor(IDENTIFIER_SCHEME, identifier.scheme)}
                  value={<span className="font-mono text-[13px]">{identifier.value}</span>}
                />
              ))}
              {Object.entries(patient.attributes ?? {})
                .filter(([key]) => key !== 'scientificName')
                .map(([key, value]) => (
                  <DataRow key={key} label={humanize(key)} value={String(value)} />
                ))}
              <DataRow label="Cadastrado em" value={formatDate(patient.createdAt)} />
            </dl>
            {patient.notes && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Observações</p>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-[var(--ink-2)]">{patient.notes}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Alergias"
              action={
                can('patient:update') ? (
                  <Button variant="ghost" size="sm" onClick={() => setAllergyOpen(true)}>
                    Registrar
                  </Button>
                ) : undefined
              }
            />
            {patient.allergies.length === 0 ? (
              <div className="px-4 py-3">
                <p className="text-[13.5px] text-[var(--ink-3)]">
                  {patient.noKnownAllergies
                    ? 'Sem alergias conhecidas, conforme confirmado no cadastro.'
                    : 'Nenhuma alergia registrada. Isso não significa ausência de alergia.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {patient.allergies.map((allergy) => {
                  const severity = statusFor(SEVERITY, allergy.severity);
                  return (
                    <li key={allergy.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[var(--ink)]">{allergy.substance}</p>
                        {allergy.reaction && (
                          <p className="text-[12.5px] text-[var(--ink-3)]">{allergy.reaction}</p>
                        )}
                      </div>
                      <Badge tone={allergy.status === 'active' ? severity.tone : 'muted'}>
                        {allergy.status === 'active' ? severity.label : 'Inativa'}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4 md:space-y-5">
          <Card>
            <CardHeader
              title="Histórico"
              description="Eventos montados a partir dos registros clínicos."
              action={
                <Link
                  href={`/pacientes/${patient.id}/prontuario`}
                  className="text-[13px] font-medium text-[var(--brand)]"
                >
                  Prontuário completo
                </Link>
              }
            />
            <PatientTimeline patientId={patient.id} limit={30} />
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href={`/pacientes/${patient.id}/prontuario`}
              icon={<Stethoscope className="h-4 w-4" />}
              label="Atendimentos e evolução"
            />
            <QuickLink
              href={`/documentos?pacienteId=${patient.id}`}
              icon={<FileText className="h-4 w-4" />}
              label="Documentos do paciente"
            />
          </div>
        </div>
      </div>

      <PatientFormSheet open={editOpen} onOpenChange={setEditOpen} patient={patient} />
      <WeightSheet
        open={weightOpen}
        onOpenChange={setWeightOpen}
        patient={patient}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
          void queryClient.invalidateQueries({ queryKey: ['patient-weights', patient.id] });
          void queryClient.invalidateQueries({ queryKey: ['timeline', patient.id] });
        }}
      />
      <AllergySheet
        open={allergyOpen}
        onOpenChange={setAllergyOpen}
        patientId={patient.id}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['patient', patient.id] })}
      />
    </>
  );
}

function humanize(key: string): string {
  const map: Record<string, string> = {
    terrariumTempC: 'Temperatura do terrário',
    humidityPercent: 'Umidade',
    uvbSource: 'Fonte de UVB',
    heightCm: 'Altura na cernelha',
    coat: 'Pelagem',
    passport: 'Passaporte',
    lot: 'Lote',
    productionStage: 'Fase de produção',
    milkLitersDay: 'Produção diária',
    ringNumber: 'Anilha',
    wingSpanCm: 'Envergadura',
    waterTempC: 'Temperatura da água',
    ph: 'pH',
    tankLiters: 'Volume do aquário',
    ibamaLicense: 'Licença IBAMA',
    origin: 'Origem',
    birds: 'Aves no lote',
  };
  return map[key] ?? key;
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[14px] font-medium text-[var(--ink-2)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
    >
      <span className="text-[var(--ink-3)]">{icon}</span>
      {label}
    </Link>
  );
}

function WeightSheet({
  open,
  onOpenChange,
  patient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [uom, setUom] = useState<'kg' | 'g'>(patient.species.defaultWeightUom === 'g' ? 'g' : 'kg');
  const [saving, setSaving] = useState(false);

  async function save() {
    const numeric = Number(value.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error('Informe um peso válido.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/patients/${patient.id}/observations/weight`, {
        value: numeric,
        uom,
      });
      toast.success('Peso registrado.');
      setValue('');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar peso"
      description="Entra no histórico e passa a valer para o cálculo de dose."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving} className="sm:w-auto">
            Registrar
          </Button>
        </>
      }
    >
      <Field label="Peso" required>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            placeholder={uom === 'g' ? '92' : '8,4'}
          />
          <Select value={uom} onChange={(event) => setUom(event.target.value as 'kg' | 'g')} className="w-24">
            <option value="kg">kg</option>
            <option value="g">g</option>
          </Select>
        </div>
      </Field>
    </Sheet>
  );
}

function AllergySheet({
  open,
  onOpenChange,
  patientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onSaved: () => void;
}) {
  const [substance, setSubstance] = useState('');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe' | 'unknown'>('moderate');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (substance.trim().length < 2) {
      toast.error('Informe a substância.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/patients/${patientId}/allergies`, {
        substance: substance.trim(),
        reaction: reaction.trim() || undefined,
        severity,
      });
      toast.success('Alergia registrada. A receita passa a alertar sobre ela.');
      setSubstance('');
      setReaction('');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar alergia"
      description="O sistema cruza o princípio ativo com toda receita emitida."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving} className="sm:w-auto">
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Substância ou princípio ativo" required>
          <Input
            autoFocus
            value={substance}
            onChange={(event) => setSubstance(event.target.value)}
            placeholder="Ex.: Dipirona"
          />
        </Field>
        <Field label="Reação observada">
          <Textarea
            value={reaction}
            onChange={(event) => setReaction(event.target.value)}
            rows={3}
            placeholder="Ex.: urticária e prurido intenso"
          />
        </Field>
        <Field label="Gravidade">
          <Select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
            <option value="mild">Leve</option>
            <option value="moderate">Moderada</option>
            <option value="severe">Grave</option>
            <option value="unknown">Não classificada</option>
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
