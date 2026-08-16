'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreatePatient, Guardian, Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useBreeds, useSpecies } from '@/lib/catalog';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { SectionTitle } from '@/components/ui/primitives';
import { GuardianPicker } from '@/components/guardians/guardian-picker';

/**
 * Cadastro de paciente. O formulário se adapta à espécie escolhida: o campo
 * de peso muda de unidade, o nome científico aparece quando a espécie exige,
 * e os atributos específicos (temperatura do terrário, lote, anilha) entram
 * conforme o esquema declarado no catálogo.
 */
export function PatientFormSheet({
  open,
  onOpenChange,
  patient,
  onSaved,
  presetGuardian,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onSaved?: (patient: Patient) => void;
  presetGuardian?: Guardian | null;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(patient);
  const { data: species = [] } = useSpecies();

  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [breedId, setBreedId] = useState('');
  const [breedFreeText, setBreedFreeText] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [reproductiveStatus, setReproductiveStatus] = useState<'intact' | 'neutered' | 'spayed' | 'unknown'>('unknown');
  const [ageMode, setAgeMode] = useState<'birth' | 'estimated'>('birth');
  const [birthDate, setBirthDate] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [colorMarkings, setColorMarkings] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUom, setWeightUom] = useState<'kg' | 'g'>('kg');
  const [microchip, setMicrochip] = useState('');
  const [notes, setNotes] = useState('');
  const [guardian, setGuardian] = useState<{ id: string; name: string } | null>(null);
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [createGuardianInline, setCreateGuardianInline] = useState(false);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedSpecies = useMemo(() => species.find((s) => s.id === speciesId) ?? null, [species, speciesId]);
  const { data: breeds = [] } = useBreeds(speciesId);

  useEffect(() => {
    if (!open) return;
    if (patient) {
      setName(patient.name);
      setSpeciesId(patient.species.id);
      setBreedId(patient.breed?.id ?? '');
      setBreedFreeText(patient.breedFreeText ?? '');
      setScientificName(String(patient.attributes?.scientificName ?? ''));
      setSex(patient.sex);
      setReproductiveStatus(patient.reproductiveStatus);
      setAgeMode(patient.birthDate ? 'birth' : 'estimated');
      setBirthDate(patient.birthDate ?? '');
      setAgeYears(patient.estimatedAgeMonths ? String(Math.floor(patient.estimatedAgeMonths / 12)) : '');
      setAgeMonths(patient.estimatedAgeMonths ? String(patient.estimatedAgeMonths % 12) : '');
      setColorMarkings(patient.colorMarkings ?? '');
      setNotes(patient.notes ?? '');
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(patient.attributes ?? {})) {
        if (key !== 'scientificName') attrs[key] = String(value ?? '');
      }
      setAttributes(attrs);
    } else {
      setName('');
      setSpeciesId(species[0]?.id ?? '');
      setBreedId('');
      setBreedFreeText('');
      setScientificName('');
      setSex('unknown');
      setReproductiveStatus('unknown');
      setAgeMode('birth');
      setBirthDate('');
      setAgeYears('');
      setAgeMonths('');
      setColorMarkings('');
      setWeight('');
      setWeightUom('kg');
      setMicrochip('');
      setNotes('');
      setAttributes({});
      setGuardian(presetGuardian ? { id: presetGuardian.id, name: presetGuardian.name } : null);
      setCreateGuardianInline(false);
      setNewGuardianName('');
      setNewGuardianPhone('');
    }
    setErrors({});
  }, [open, patient, species, presetGuardian]);

  useEffect(() => {
    if (selectedSpecies) setWeightUom(selectedSpecies.defaultWeightUom === 'g' ? 'g' : 'kg');
  }, [selectedSpecies]);

  const attributeSchema = useMemo(() => {
    const raw = (selectedSpecies as unknown as { attributeSchema?: Record<string, { label?: string; type?: string }> })
      ?.attributeSchema;
    return raw ?? {};
  }, [selectedSpecies]);

  const mutation = useMutation({
    mutationFn: async () => {
      const estimatedAgeMonths =
        ageMode === 'estimated' && (ageYears || ageMonths)
          ? Number(ageYears || 0) * 12 + Number(ageMonths || 0)
          : undefined;

      const weightKg =
        weight.trim() === ''
          ? undefined
          : weightUom === 'g'
            ? Number(weight.replace(',', '.')) / 1000
            : Number(weight.replace(',', '.'));

      const attributePayload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (value.trim() === '') continue;
        const numeric = Number(value.replace(',', '.'));
        attributePayload[key] = Number.isFinite(numeric) && attributeSchema[key]?.type === 'number' ? numeric : value;
      }
      if (scientificName.trim()) attributePayload.scientificName = scientificName.trim();

      const payload: Partial<CreatePatient> = {
        name: name.trim(),
        speciesId,
        breedId: breedId || undefined,
        breedFreeText: breedFreeText.trim() || undefined,
        sex,
        reproductiveStatus,
        birthDate: ageMode === 'birth' && birthDate ? birthDate : undefined,
        birthDatePrecision: ageMode === 'birth' && birthDate ? 'exact' : undefined,
        estimatedAgeMonths,
        colorMarkings: colorMarkings.trim() || undefined,
        notes: notes.trim() || undefined,
        attributes: attributePayload,
      };

      if (editing && patient) {
        return api.patch<Patient>(`/patients/${patient.id}`, payload);
      }

      const createPayload: Record<string, unknown> = {
        ...payload,
        weightKg,
        identifiers: microchip.trim() ? [{ scheme: 'microchip', value: microchip.trim() }] : [],
      };

      if (createGuardianInline && newGuardianName.trim()) {
        createPayload.newGuardian = {
          name: newGuardianName.trim(),
          documentKind: 'none',
          phonePrimary: newGuardianPhone.trim() || undefined,
        };
      } else if (guardian) {
        createPayload.guardians = [{ guardianId: guardian.id, role: 'owner', isPrimary: true }];
      }

      return api.post<Patient>('/patients', createPayload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', saved.id] });
      toast.success(editing ? 'Paciente atualizado.' : 'Paciente cadastrado.');
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => {
      const issues = error instanceof Error && 'fieldIssues' in error ? (error as never as { fieldIssues: Array<{ path: string; message: string }> }).fieldIssues : [];
      if (issues.length > 0) {
        setErrors(Object.fromEntries(issues.map((issue) => [issue.path, issue.message])));
      }
      toast.error(errorMessage(error));
    },
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Informe o nome do paciente.';
    if (!speciesId) next.speciesId = 'Escolha a espécie.';
    if (selectedSpecies?.requiresScientificName && !scientificName.trim() && !breedId) {
      next.scientificName = 'Para esta espécie, informe o nome científico ou selecione no catálogo.';
    }
    if (!editing && !guardian && !(createGuardianInline && newGuardianName.trim())) {
      next.guardian = 'Vincule um tutor ou cadastre um novo.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${patient?.name}` : 'Novo paciente'}
      description={editing ? undefined : 'O paciente é vinculado a um tutor responsável.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (validate()) mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            {editing ? 'Salvar' : 'Cadastrar paciente'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!editing && (
          <section className="space-y-3">
            <SectionTitle>Tutor responsável</SectionTitle>
            {createGuardianInline ? (
              <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <Field label="Nome do tutor" required error={errors.guardian}>
                  <Input
                    value={newGuardianName}
                    onChange={(event) => setNewGuardianName(event.target.value)}
                    placeholder="Nome completo"
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    value={newGuardianPhone}
                    onChange={(event) => setNewGuardianPhone(event.target.value)}
                    placeholder="(11) 90000-0000"
                    inputMode="tel"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setCreateGuardianInline(false)}
                  className="text-[13px] font-medium text-[var(--brand)]"
                >
                  Escolher um tutor já cadastrado
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <GuardianPicker value={guardian} onChange={setGuardian} error={errors.guardian} />
                <button
                  type="button"
                  onClick={() => {
                    setCreateGuardianInline(true);
                    setGuardian(null);
                  }}
                  className="text-[13px] font-medium text-[var(--brand)]"
                >
                  Cadastrar um tutor novo agora
                </button>
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <SectionTitle>Identificação</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" required error={errors.name} className="sm:col-span-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do animal" />
            </Field>

            <Field label="Espécie" required error={errors.speciesId}>
              <Select
                value={speciesId}
                onChange={(event) => {
                  setSpeciesId(event.target.value);
                  setBreedId('');
                  setAttributes({});
                }}
              >
                <option value="">Selecione</option>
                {species.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.namePt}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Raça">
              <Select value={breedId} onChange={(event) => setBreedId(event.target.value)} disabled={!speciesId}>
                <option value="">Não informada</option>
                {breeds.map((breed) => (
                  <option key={breed.id} value={breed.id}>
                    {breed.name}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedSpecies?.requiresScientificName && (
              <Field
                label="Nome científico"
                hint="Espécies silvestres e exóticas são identificadas pelo nome científico."
                error={errors.scientificName}
                className="sm:col-span-2"
              >
                <Input
                  value={scientificName}
                  onChange={(event) => setScientificName(event.target.value)}
                  placeholder="Ex.: Chelonoidis carbonarius"
                />
              </Field>
            )}

            {breeds.length === 0 && speciesId && (
              <Field label="Raça (texto livre)" className="sm:col-span-2">
                <Input
                  value={breedFreeText}
                  onChange={(event) => setBreedFreeText(event.target.value)}
                  placeholder="Se não houver no catálogo"
                />
              </Field>
            )}

            <Field label="Sexo">
              <Select value={sex} onChange={(event) => setSex(event.target.value as typeof sex)}>
                <option value="unknown">Não informado</option>
                <option value="male">Macho</option>
                <option value="female">Fêmea</option>
              </Select>
            </Field>

            <Field label="Status reprodutivo">
              <Select
                value={reproductiveStatus}
                onChange={(event) => setReproductiveStatus(event.target.value as typeof reproductiveStatus)}
              >
                <option value="unknown">Não informado</option>
                <option value="intact">Inteiro</option>
                <option value="neutered">Castrado</option>
                <option value="spayed">Castrada</option>
              </Select>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle>Idade</SectionTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAgeMode('birth')}
              className={`flex-1 rounded-[var(--radius)] border px-3 py-2 text-[13.5px] font-medium ${
                ageMode === 'birth'
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'border-[var(--border-strong)] text-[var(--ink-2)]'
              }`}
            >
              Data de nascimento
            </button>
            <button
              type="button"
              onClick={() => setAgeMode('estimated')}
              className={`flex-1 rounded-[var(--radius)] border px-3 py-2 text-[13.5px] font-medium ${
                ageMode === 'estimated'
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'border-[var(--border-strong)] text-[var(--ink-2)]'
              }`}
            >
              Idade estimada
            </button>
          </div>

          {ageMode === 'birth' ? (
            <Field label="Nascimento">
              <Input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Anos">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={ageYears}
                  onChange={(event) => setAgeYears(event.target.value)}
                />
              </Field>
              <Field label="Meses">
                <Input
                  type="number"
                  min={0}
                  max={11}
                  inputMode="numeric"
                  value={ageMonths}
                  onChange={(event) => setAgeMonths(event.target.value)}
                />
              </Field>
            </div>
          )}
        </section>

        {!editing && (
          <section className="space-y-3">
            <SectionTitle>Dados iniciais</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Peso (${weightUom})`} hint="Registrado como primeira medida do histórico.">
                <div className="flex gap-2">
                  <Input
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    inputMode="decimal"
                    placeholder={weightUom === 'g' ? '92' : '8,4'}
                  />
                  <Select
                    value={weightUom}
                    onChange={(event) => setWeightUom(event.target.value as 'kg' | 'g')}
                    className="w-20"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </Select>
                </div>
              </Field>

              <Field label="Microchip">
                <Input
                  value={microchip}
                  onChange={(event) => setMicrochip(event.target.value)}
                  inputMode="numeric"
                  placeholder="15 dígitos"
                />
              </Field>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <SectionTitle>Características</SectionTitle>
          <Field label="Pelagem, cor e marcas">
            <Input
              value={colorMarkings}
              onChange={(event) => setColorMarkings(event.target.value)}
              placeholder="Ex.: caramelo com peito branco"
            />
          </Field>

          {Object.keys(attributeSchema).length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(attributeSchema).map(([key, definition]) => (
                <Field key={key} label={definition.label ?? key}>
                  <Input
                    value={attributes[key] ?? ''}
                    inputMode={definition.type === 'number' ? 'decimal' : 'text'}
                    onChange={(event) =>
                      setAttributes((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}

          <Field label="Observações do cadastro" hint="Informação administrativa. O que é clínico vai no prontuário.">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </Field>
        </section>
      </div>
    </Sheet>
  );
}
