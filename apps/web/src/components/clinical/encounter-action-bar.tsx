'use client';

import Link from 'next/link';
import { ArrowLeft, CheckCircle2, MoreHorizontal, Play, ScrollText, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

export interface BarAction {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

/**
 * Barra de ações do atendimento no celular. Substitui a navegação geral nesta
 * tela: durante a consulta o polegar precisa alcançar sinais, receita, vacina
 * e finalizar, não o menu do sistema. As ações mudam com o tipo de serviço
 * (em vacinação, vacina vem antes de diagnóstico).
 */
export function EncounterActionBar({
  actions,
  onMore,
  primary,
  patientId,
}: {
  actions: BarAction[];
  onMore?: () => void;
  primary?: { label: string; kind: 'start' | 'finish' | 'assume'; onClick: () => void; loading?: boolean };
  patientId: string;
}) {
  const { can } = useSession();
  const writable = actions.length > 0;

  return (
    <nav
      aria-label="Ações do atendimento"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden"
    >
      <div className="flex h-[var(--mobilenav-h)] items-stretch gap-1 px-1.5">
        {writable ? (
          <>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)] active:bg-[var(--surface-2)]"
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{action.label}</span>
                </button>
              );
            })}
            {onMore && (
              <button
                type="button"
                onClick={onMore}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)] active:bg-[var(--surface-2)]"
              >
                <MoreHorizontal className="h-5 w-5" />
                Mais
              </button>
            )}
          </>
        ) : (
          <>
            <Link
              href="/atendimentos"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)]"
            >
              <ArrowLeft className="h-5 w-5" />
              Atendimentos
            </Link>
            {can('record:read_sensitive') && (
              <Link
                href={`/pacientes/${patientId}/prontuario`}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)]"
              >
                <ScrollText className="h-5 w-5" />
                Prontuário
              </Link>
            )}
            {onMore && (
              <button
                type="button"
                onClick={onMore}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)]"
              >
                <MoreHorizontal className="h-5 w-5" />
                Mais
              </button>
            )}
          </>
        )}
        {primary && (
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.loading}
            className={cn(
              'my-2 ml-1 flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-3.5 text-[14px] font-semibold text-white shadow-[var(--shadow-sm)] disabled:opacity-60',
              'bg-[var(--brand)] active:bg-[var(--brand-hover)]',
            )}
          >
            {primary.kind === 'start' ? (
              <Play className="h-4 w-4" />
            ) : primary.kind === 'assume' ? (
              <UserCheck className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {primary.label}
          </button>
        )}
      </div>
    </nav>
  );
}
