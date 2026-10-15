'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import type { ChartingSection, NoteTemplate } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/**
 * Modelos da clínica e de fábrica num lugar só. O que combina com o tipo de
 * serviço do atendimento aparece primeiro. Salvar o registro atual como modelo
 * é o caminho para a clínica montar o próprio jeito de escrever sem tela de
 * configuração.
 */
function TemplatesSheetContent({
  open,
  onOpenChange,
  templates,
  serviceCategory,
  speciesId,
  currentSections,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: NoteTemplate[];
  serviceCategory: string | null;
  speciesId: string | null;
  currentSections: Record<ChartingSection, string>;
  onApply: (template: NoteTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shortcut, setShortcut] = useState('');

  const { suggested, others, snippets } = useMemo(() => {
    const full = templates.filter((template) => template.kind === 'template');
    const suggestedList = serviceCategory
      ? full.filter((template) => template.serviceCategories.includes(serviceCategory))
      : [];
    return {
      suggested: suggestedList,
      others: full.filter((template) => !suggestedList.includes(template)),
      snippets: templates.filter((template) => template.kind === 'snippet'),
    };
  }, [templates, serviceCategory]);

  const hasContent = Object.values(currentSections).some((text) => text.trim());

  const create = useMutation({
    mutationFn: () =>
      api.post<NoteTemplate>('/note-templates', {
        kind: 'template',
        name: name.trim(),
        shortcut: shortcut.trim() || undefined,
        speciesId: speciesId ?? undefined,
        sections: Object.fromEntries(Object.entries(currentSections).filter(([, text]) => text.trim())),
      }),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ['note-templates'] });
      toast.success(
        template.shortcut ? `Modelo salvo. Digite /${template.shortcut} para usar.` : 'Modelo salvo para a clínica.',
      );
      setSaving(false);
      setName('');
      setShortcut('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/note-templates/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['note-templates'] });
      toast.success('Modelo removido.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function pick(template: NoteTemplate) {
    onApply(template);
    onOpenChange(false);
  }

  const row = (template: NoteTemplate) => (
    <li key={template.id} className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => pick(template)}
        className="flex min-w-0 flex-1 items-baseline gap-2 rounded-[var(--radius)] px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
      >
        <span className="min-w-0 truncate text-[14.5px] font-medium text-[var(--ink)]">{template.name}</span>
        {template.shortcut && (
          <span className="shrink-0 font-mono text-[12.5px] text-[var(--brand)]">/{template.shortcut}</span>
        )}
        {template.scope === 'tenant' && (
          <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 text-[11px] text-[var(--ink-3)]">da clínica</span>
        )}
      </button>
      {template.scope === 'tenant' && (
        <button
          type="button"
          onClick={() => remove.mutate(template.id)}
          aria-label={`Remover modelo ${template.name}`}
          className="rounded-[var(--radius)] p-2 text-[var(--ink-3)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Modelos e atalhos"
      description="Modelos preenchem as seções vazias e completam as que já têm texto. Nada é apagado."
      size="md"
    >
      <div className="space-y-5">
        {suggested.length > 0 && (
          <section>
            <h3 className="mb-1 px-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--brand)]">
              Para este atendimento
            </h3>
            <ul>{suggested.map(row)}</ul>
          </section>
        )}

        <section>
          <h3 className="mb-1 px-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Modelos</h3>
          <ul>{others.map(row)}</ul>
        </section>

        {snippets.length > 0 && (
          <section>
            <h3 className="mb-1 px-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              Frases rápidas
            </h3>
            <p className="mb-1 px-3 text-[12.5px] text-[var(--ink-3)]">
              Entram onde está o cursor. No texto, digite a barra e o atalho.
            </p>
            <ul>{snippets.map(row)}</ul>
          </section>
        )}

        <section className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-3">
          {saving ? (
            <div className="space-y-3">
              <Field label="Nome do modelo" required htmlFor="template-name">
                <Input
                  id="template-name"
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!shortcut || shortcut === slugify(name)) setShortcut(slugify(event.target.value));
                  }}
                  placeholder="Ex.: Consulta dermatológica"
                />
              </Field>
              <Field label="Atalho" hint="Digite / e o atalho no texto para aplicar." htmlFor="template-shortcut">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[var(--ink-3)]">/</span>
                  <Input
                    id="template-shortcut"
                    value={shortcut}
                    onChange={(event) => setShortcut(slugify(event.target.value))}
                    placeholder="derma"
                  />
                </div>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSaving(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  loading={create.isPending}
                  disabled={name.trim().length < 2}
                  onClick={() => create.mutate()}
                >
                  Salvar modelo
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" block disabled={!hasContent} onClick={() => setSaving(true)}>
              <BookmarkPlus className="h-4 w-4" />
              Salvar o registro atual como modelo
            </Button>
          )}
          {!hasContent && !saving && (
            <p className="mt-1 text-center text-[12px] text-[var(--ink-3)]">Escreva algo no registro para salvar como modelo.</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}

export function TemplatesSheet(props: React.ComponentProps<typeof TemplatesSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <TemplatesSheetContent {...props} />
    </MountWhenOpen>
  );
}
