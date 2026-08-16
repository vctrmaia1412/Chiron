'use client';

import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-3)] text-[var(--ink-2)]',
  brand: 'bg-[var(--brand-soft)] text-[var(--brand-ink)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  info: 'bg-[var(--info-soft)] text-[var(--info)]',
  muted: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  as: Component = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Component
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-[13px] text-[var(--ink-3)]">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--ink-3)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-[var(--ink-3)]">{icon}</div>}
      <p className="text-[15px] font-medium text-[var(--ink)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[var(--ink-3)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-soft-pulse rounded-[var(--radius)] bg-[var(--surface-3)]', className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <p className="text-sm text-[var(--danger)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Rótulo e valor: unidade básica de leitura clínica. */
export function DataRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <dt className="shrink-0 text-[13px] text-[var(--ink-3)]">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-[var(--border)]', className)} />;
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]',
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--brand)]',
        className,
      )}
    />
  );
}
