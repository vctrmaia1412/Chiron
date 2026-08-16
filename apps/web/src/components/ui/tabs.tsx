'use client';

import { cn } from '@/lib/cn';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

/**
 * Abas roláveis na horizontal: no celular a lista escapa da tela em vez de
 * quebrar em duas linhas ou virar um select escondido.
 */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'scrollbar-thin -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4 md:mx-0 md:px-0',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              active ? 'text-[var(--brand)]' : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && item.count > 0 && (
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] tabular',
                  active ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'bg-[var(--surface-3)] text-[var(--ink-3)]',
                )}
              >
                {item.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--brand)]" />}
          </button>
        );
      })}
    </div>
  );
}

/** Grupo de filtros em pílula, usado nas listagens. */
export function FilterChips({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ key: string; label: string; count?: number }>;
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:px-0', className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
              active
                ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className="ml-1.5 tabular text-[var(--ink-3)]">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
