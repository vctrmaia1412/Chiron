'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ExamOrderItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useExamCatalog } from '@/lib/catalog';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';

interface ValueDraft {
  analyteCode: string;
  analyteName: string;
  uom: string | null;
  value: string;
  refMin: string;
  refMax: string;
}

/**
 * Lançamento de resultado. Resultado já liberado não é editado: ao salvar de
 * novo, o servidor cria uma retificação que supersede a anterior e mantém as
 * duas versões visíveis.
 */
export function ExamResultSheet({ item, onClose }: { item: ExamOrderItem | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: catalog = [] } = useExamCatalog(Boolean(item));

  const [values, setValues] = useState<ValueDraft[]>([]);
  const [reportText, setReportText] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [status, setStatus] = useState<'preliminary' | 'final'>('final');

  const analytes = useMemo(() => {
    const entry = catalog.find((exam) => exam.id === item?.examCatalogId);
    return entry?.analytes ?? [];
  }, [catalog, item?.examCatalogId]);

  useEffect(() => {
    if (!item) return;
    const existing = item.result?.values ?? [];
    if (existing.length > 0) {
      setValues(
        existing.map((value) => ({
          analyteCode: value.analyteCode,
          analyteName: value.analyteName,
          uom: value.uom,
          value: value.valueNumeric ?? value.valueText ?? '',
          refMin: value.refMin ?? '',
          refMax: value.refMax ?? '',
        })),
      );
    } else {
      setValues(
        analytes.map((analyte) => ({
          analyteCode: analyte.code,
          analyteName: analyte.name,
          uom: analyte.uom,
          value: '',
          refMin: '',
          refMax: '',
        })),
      );
    }
    setReportText(item.result?.reportText ?? '');
    setInterpretation(item.result?.interpretation ?? '');
    setStatus('final');
  }, [item, analytes]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('Item não informado.');
      return api.post(`/exam-orders/items/${item.id}/result`, {
        status,
        reportText: reportText.trim() || undefined,
        interpretation: interpretation.trim() || undefined,
        values: values
          .filter((value) => value.value.trim() !== '')
          .map((value) => {
            const numeric = Number(value.value.replace(',', '.'));
            const isNumeric = Number.isFinite(numeric) && value.value.trim() !== '';
            return {
              analyteCode: value.analyteCode,
              analyteName: value.analyteName,
              valueNumeric: isNumeric ? numeric : undefined,
              valueText: isNumeric ? undefined : value.value.trim(),
              uom: value.uom ?? undefined,
              refMin: value.refMin.trim() ? Number(value.refMin.replace(',', '.')) : undefined,
              refMax: value.refMax.trim() ? Number(value.refMax.replace(',', '.')) : undefined,
            };
          }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(item?.result ? 'Resultado retificado. A versão anterior continua registrada.' : 'Resultado lançado.');
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={Boolean(item)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={item?.result ? 'Retificar resultado' : 'Lançar resultado'}
      description={item?.examName}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Salvar resultado
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {item?.result && (
          <p className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2 text-[13px] text-[var(--warning)]">
            Já existe um resultado liberado. Salvar cria uma retificação, e o resultado anterior continua consultável.
          </p>
        )}

        {values.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Analitos</p>
            <div className="space-y-2">
              {values.map((value, index) => (
                <div key={value.analyteCode} className="grid grid-cols-[1fr_84px_64px_64px] items-end gap-2">
                  <span className="pb-2.5 text-[13.5px] text-[var(--ink-2)]">
                    {value.analyteName}
                    {value.uom ? <span className="text-[var(--ink-3)]"> ({value.uom})</span> : null}
                  </span>
                  <Input
                    value={value.value}
                    onChange={(event) =>
                      setValues((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)),
                      )
                    }
                    inputMode="decimal"
                    aria-label={`Valor de ${value.analyteName}`}
                  />
                  <Input
                    value={value.refMin}
                    onChange={(event) =>
                      setValues((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, refMin: event.target.value } : entry)),
                      )
                    }
                    placeholder="mín"
                    inputMode="decimal"
                    aria-label={`Referência mínima de ${value.analyteName}`}
                  />
                  <Input
                    value={value.refMax}
                    onChange={(event) =>
                      setValues((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, refMax: event.target.value } : entry)),
                      )
                    }
                    placeholder="máx"
                    inputMode="decimal"
                    aria-label={`Referência máxima de ${value.analyteName}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Conclusão" hint="Interpretação do laudo.">
          <Textarea value={interpretation} onChange={(event) => setInterpretation(event.target.value)} rows={3} />
        </Field>

        <Field label="Observações técnicas">
          <Textarea value={reportText} onChange={(event) => setReportText(event.target.value)} rows={2} />
        </Field>

        <Field label="Situação">
          <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="final">Final</option>
            <option value="preliminary">Preliminar</option>
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
