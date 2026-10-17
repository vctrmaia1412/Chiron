'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NoteTemplate } from '@chiron/contracts';
import { cn } from '@/lib/cn';

export interface SmartTextareaHandle {
  focus: () => void;
  /** Insere texto onde está o cursor (ou no fim), separando com espaço ou linha. */
  insert: (text: string) => void;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Caixa de texto que cresce com o conteúdo e entende atalhos com barra:
 * `/otite` aplica o modelo de otite, `/sad` insere "sem alterações dignas de
 * nota". O menu aparece logo abaixo do campo, que é onde o polegar e o olho já
 * estão, e responde a setas, Enter, Tab e Esc no teclado físico.
 */
export const SmartTextarea = forwardRef<
  SmartTextareaHandle,
  {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    minRows?: number;
    templates: NoteTemplate[];
    onApplyTemplate: (template: NoteTemplate) => void;
    ariaLabel?: string;
    className?: string;
  }
>(function SmartTextarea(
  { id, value, onChange, onFocus, onBlur, placeholder, minRows = 2, templates, onApplyTemplate, ariaLabel, className },
  ref,
) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
    insert: (text: string) => {
      const element = textarea.current;
      const caret = element && document.activeElement === element ? element.selectionStart : value.length;
      const before = value.slice(0, caret);
      const after = value.slice(caret);
      const separator = before.length === 0 || /\s$/.test(before) ? '' : ' ';
      const next = `${before}${separator}${text}${after}`;
      onChange(next);
      requestAnimationFrame(() => {
        if (!element) return;
        const position = before.length + separator.length + text.length;
        element.setSelectionRange(position, position);
      });
    },
  }));

  // Altura acompanha o texto: nada de barra de rolagem dentro de um campo
  // clínico, que esconde justamente o que foi escrito antes.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);

  const matches = useMemo(() => {
    if (!slash) return [];
    const query = normalize(slash.query);
    return templates
      .filter((template) => template.shortcut)
      .filter(
        (template) =>
          !query ||
          normalize(template.shortcut ?? '').startsWith(query) ||
          normalize(template.name)
            .split(/[^a-z0-9]+/)
            .some((word) => word.startsWith(query)),
      )
      .slice(0, 8);
  }, [slash, templates]);

  function detectSlash(text: string, caret: number) {
    const before = text.slice(0, caret);
    const match = /(^|\s)\/([a-z0-9-]*)$/i.exec(before);
    if (match) {
      setSlash({ query: match[2] ?? '', start: caret - (match[2]?.length ?? 0) - 1 });
      setHighlight(0);
    } else if (slash) {
      setSlash(null);
    }
  }

  function choose(template: NoteTemplate) {
    if (!slash) return;
    const caret = textarea.current?.selectionStart ?? value.length;
    const before = value.slice(0, slash.start);
    const after = value.slice(caret);
    setSlash(null);

    if (template.kind === 'snippet' && template.body) {
      const next = `${before}${template.body}${after}`;
      onChange(next);
      requestAnimationFrame(() => {
        const position = before.length + (template.body?.length ?? 0);
        textarea.current?.setSelectionRange(position, position);
        textarea.current?.focus();
      });
      return;
    }

    onChange(`${before}${after}`.trimEnd());
    onApplyTemplate(template);
  }

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={textarea}
        aria-label={ariaLabel}
        value={value}
        rows={minRows}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={() => {
          // Deixa o toque no item do menu acontecer antes de fechar.
          setTimeout(() => setSlash(null), 150);
          onBlur?.();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          detectSlash(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={(event) => {
          // Tab leva à próxima lacuna "__" deixada por um modelo, já
          // selecionada: é só digitar por cima. Sem lacuna, o Tab segue normal.
          if (event.key === 'Tab' && !event.shiftKey && !(slash && matches.length > 0)) {
            const element = event.currentTarget;
            // só para a frente: sem lacuna depois do cursor, o foco sai do campo
            const target = value.indexOf('__', element.selectionEnd);
            if (target >= 0) {
              event.preventDefault();
              element.setSelectionRange(target, target + 2);
            }
            return;
          }
          if (!slash || matches.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlight((current) => (current + 1) % matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const template = matches[highlight];
            if (template) choose(template);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setSlash(null);
          }
        }}
        className={cn(
          'block w-full resize-none overflow-hidden rounded-[var(--radius)] border border-transparent bg-[var(--surface-2)] px-3 py-2.5',
          'leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-3)] transition-colors',
          'focus:border-[var(--brand)] focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-soft)]',
          className,
        )}
      />

      {slash && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Atalhos"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
        >
          {matches.map((template, index) => (
            <li key={template.id} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(template)}
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-2 text-left',
                  index === highlight ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <span className="shrink-0 font-mono text-[13px] font-semibold text-[var(--brand)]">
                  /{template.shortcut}
                </span>
                <span className="min-w-0 truncate text-[13.5px] text-[var(--ink-2)]">
                  {template.name}
                  {template.kind === 'template' ? ' · modelo' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
