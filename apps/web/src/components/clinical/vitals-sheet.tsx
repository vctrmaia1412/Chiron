'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useObservationCodes, useSpecies } from '@/lib/catalog';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

/**
 * O painel de sinais vitais segue a espécie: bovino ganha motilidade ruminal,
 * réptil ganha temperatura ambiente, ave não mostra tempo de preenchimento
 * capilar. A lista vem do catálogo, não de uma constante no frontend.
 */
function VitalsSheetContent({
  open,
  onOpenChange,
  encounterId,
  speciesCode,
  isTriage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  speciesCode: string | null;
  isTriage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: codes = [] } = useObservationCodes();
  const { data: species = [] } = useSpecies();

  const [values, setValues] = useState<Record<string, string>>({});
  const [uoms, setUoms] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const panel = useMemo(() => {
    const current = species.find((item) => item.code === speciesCode);
    const allowed = current?.observationPanel ?? [];
    const ordered = [...codes].sort((a, b) => a.sort - b.sort);
    if (allowed.length === 0) return ordered.filter((code) => code.code !== 'weight');
    return ordered.filter((code) => allowed.includes(code.code));
  }, [codes, species, speciesCode]);

  const mutation = useMutation({
    mutationFn: async () => {
      const items = panel
        .filter((code) => (values[code.code] ?? '').trim() !== '')
        .map((code) => ({
          code: code.code,
          value:
            code.valueKind === 'numeric'
              ? Number((values[code.code] ?? '').replace(',', '.'))
              : (values[code.code] ?? ''),
          uom: code.valueKind === 'numeric' ? (uoms[code.code] || code.canonicalUom || undefined) : undefined,
        }));

      if (items.length === 0 && !note.trim()) {
        throw new Error('Preencha ao menos um sinal vital.');
      }

      if (isTriage) {
        return api.post(`/encounters/${encounterId}/triage`, {
          observations: items.length > 0 ? items : undefined,
          note: note.trim() || undefined,
        });
      }
      return api.post(`/encounters/${encounterId}/observations`, { items });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      toast.success('Sinais vitais registrados.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isTriage ? 'Triagem' : 'Sinais vitais'}
      description="Valores fora da unidade padrão são convertidos e o valor digitado fica registrado."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {panel.map((code) => (
            <Field key={code.code} label={code.name}>
              {code.valueKind === 'code' ? (
                <Select
                  value={values[code.code] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [code.code]: event.target.value }))}
                >
                  <option value="">Não avaliado</option>
                  {code.allowedCodes.map((allowed) => (
                    <option key={allowed} value={allowed}>
                      {allowed}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={values[code.code] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [code.code]: event.target.value }))}
                    inputMode={code.valueKind === 'numeric' ? 'decimal' : 'text'}
                    placeholder={code.scale ?? ''}
                  />
                  {code.allowedUoms.length > 1 ? (
                    <Select
                      value={uoms[code.code] ?? code.canonicalUom ?? ''}
                      onChange={(event) => setUoms((current) => ({ ...current, [code.code]: event.target.value }))}
                      className="w-20"
                    >
                      {code.allowedUoms.map((uom) => (
                        <option key={uom} value={uom}>
                          {uom}
                        </option>
                      ))}
                    </Select>
                  ) : code.canonicalUom ? (
                    <span className="flex h-11 w-14 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--ink-3)] md:h-10">
                      {code.canonicalUom}
                    </span>
                  ) : null}
                </div>
              )}
            </Field>
          ))}
        </div>

        {isTriage && (
          <Field label="Nota da triagem">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Estado geral, comportamento, prioridade."
            />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

export function VitalsSheet(props: React.ComponentProps<typeof VitalsSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <VitalsSheetContent {...props} />
    </MountWhenOpen>
  );
}
