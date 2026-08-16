'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Guardian } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SectionTitle } from '@/components/ui/primitives';

export function GuardianFormSheet({
  open,
  onOpenChange,
  guardian,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardian?: Guardian | null;
  onSaved?: (guardian: Guardian) => void;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(guardian);

  const [personType, setPersonType] = useState<'individual' | 'company'>('individual');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [documentKind, setDocumentKind] = useState<'cpf' | 'cnpj' | 'passport' | 'none'>('cpf');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [phoneSecondary, setPhoneSecondary] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (guardian) {
      setPersonType(guardian.personType);
      setName(guardian.name);
      setLegalName(guardian.legalName ?? '');
      setDocumentKind(guardian.documentKind);
      setDocument('');
      setEmail(guardian.email ?? '');
      setPhonePrimary(guardian.phonePrimary ?? '');
      setPhoneSecondary(guardian.phoneSecondary ?? '');
      setBirthDate(guardian.birthDate ?? '');
      setZipCode(guardian.address?.zipCode ?? '');
      setStreet(guardian.address?.street ?? '');
      setNumber(guardian.address?.number ?? '');
      setDistrict(guardian.address?.district ?? '');
      setCity(guardian.address?.city ?? '');
      setState(guardian.address?.state ?? '');
      setNotes(guardian.notes ?? '');
    } else {
      setPersonType('individual');
      setName('');
      setLegalName('');
      setDocumentKind('cpf');
      setDocument('');
      setEmail('');
      setPhonePrimary('');
      setPhoneSecondary('');
      setBirthDate('');
      setZipCode('');
      setStreet('');
      setNumber('');
      setDistrict('');
      setCity('');
      setState('');
      setNotes('');
    }
  }, [open, guardian]);

  const mutation = useMutation({
    mutationFn: () => {
      const address =
        street || city || zipCode
          ? {
              zipCode: zipCode.trim() || undefined,
              street: street.trim() || undefined,
              number: number.trim() || undefined,
              district: district.trim() || undefined,
              city: city.trim() || undefined,
              state: state.trim().toUpperCase() || undefined,
            }
          : undefined;

      const payload = {
        personType,
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        documentKind,
        document: document.replace(/\D/g, '') || undefined,
        email: email.trim() || undefined,
        phonePrimary: phonePrimary.trim() || undefined,
        phoneSecondary: phoneSecondary.trim() || undefined,
        birthDate: birthDate || undefined,
        address,
        notes: notes.trim() || undefined,
      };

      return editing && guardian
        ? api.patch<Guardian>(`/guardians/${guardian.id}`, payload)
        : api.post<Guardian>('/guardians', payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['guardians'] });
      await queryClient.invalidateQueries({ queryKey: ['guardian', saved.id] });
      toast.success(editing ? 'Tutor atualizado.' : 'Tutor cadastrado.');
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const issues = error.fieldIssues;
        if (issues.length > 0) setErrors(Object.fromEntries(issues.map((issue) => [issue.path, issue.message])));
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Editar ${guardian?.name}` : 'Novo tutor'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (name.trim().length < 2) {
                setErrors({ name: 'Informe o nome.' });
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            {editing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <SectionTitle>Identificação</SectionTitle>

          <Field label="Tipo">
            <Select
              value={personType}
              onChange={(event) => {
                const next = event.target.value as typeof personType;
                setPersonType(next);
                setDocumentKind(next === 'company' ? 'cnpj' : 'cpf');
              }}
            >
              <option value="individual">Pessoa física</option>
              <option value="company">Pessoa jurídica</option>
            </Select>
          </Field>

          <Field label={personType === 'company' ? 'Nome fantasia' : 'Nome completo'} required error={errors.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          {personType === 'company' && (
            <Field label="Razão social">
              <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Documento">
              <Select
                value={documentKind}
                onChange={(event) => setDocumentKind(event.target.value as typeof documentKind)}
              >
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="passport">Passaporte</option>
                <option value="none">Não informado</option>
              </Select>
            </Field>
            <Field
              label="Número"
              error={errors.document}
              hint={
                editing
                  ? 'Deixe em branco para manter o documento atual.'
                  : 'Guardado cifrado e pesquisável por índice cego.'
              }
            >
              <Input
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                inputMode="numeric"
                disabled={documentKind === 'none'}
                placeholder={documentKind === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
              />
            </Field>
          </div>

          {personType === 'individual' && (
            <Field label="Nascimento">
              <Input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </Field>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle>Contato</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefone principal" error={errors.phonePrimary}>
              <Input
                value={phonePrimary}
                onChange={(event) => setPhonePrimary(event.target.value)}
                inputMode="tel"
                placeholder="(11) 90000-0000"
              />
            </Field>
            <Field label="Telefone secundário">
              <Input
                value={phoneSecondary}
                onChange={(event) => setPhoneSecondary(event.target.value)}
                inputMode="tel"
              />
            </Field>
          </div>
          <Field label="E-mail" error={errors.email}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputMode="email"
              autoCapitalize="none"
            />
          </Field>
        </section>

        <section className="space-y-3">
          <SectionTitle>Endereço</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="CEP">
              <Input value={zipCode} onChange={(event) => setZipCode(event.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Rua" className="sm:col-span-2">
              <Input value={street} onChange={(event) => setStreet(event.target.value)} />
            </Field>
            <Field label="Número">
              <Input value={number} onChange={(event) => setNumber(event.target.value)} />
            </Field>
            <Field label="Bairro">
              <Input value={district} onChange={(event) => setDistrict(event.target.value)} />
            </Field>
            <Field label="Cidade">
              <Input value={city} onChange={(event) => setCity(event.target.value)} />
            </Field>
            <Field label="UF">
              <Input
                value={state}
                onChange={(event) => setState(event.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            </Field>
          </div>
        </section>

        <Field label="Observações">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
