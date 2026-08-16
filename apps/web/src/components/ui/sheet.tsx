'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Uma superfície modal só. No celular ela sobe do rodapé como bottom sheet,
 * ocupando no máximo 92% da altura e rolando por dentro, para que o teclado
 * virtual não empurre o formulário para fora da tela. No desktop vira diálogo
 * central. Assim não existe "versão mobile" separada para manter.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const width = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-xl',
    lg: 'sm:max-w-3xl',
    xl: 'sm:max-w-5xl',
  }[size];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(16,32,31,0.42)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-[var(--surface)] shadow-[var(--shadow-lg)] focus:outline-none',
            // celular: folha inferior
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[18px] animate-sheet-up',
            // desktop: diálogo central
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:w-full',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)] sm:animate-in-soft',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-semibold text-[var(--ink)]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-[13px] text-[var(--ink-3)]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-1 rounded-[var(--radius)] p-2 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {children}
          </div>

          {footer && (
            <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] sm:h-10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'h-11 rounded-[var(--radius)] px-4 text-sm font-medium text-white disabled:opacity-60 sm:h-10',
              destructive ? 'bg-[var(--danger)] hover:bg-[#9c1e15]' : 'bg-[var(--brand)] hover:bg-[var(--brand-hover)]',
            )}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </>
      }
    >
      {children ?? <p className="text-sm text-[var(--ink-2)]">Esta ação será registrada na auditoria.</p>}
    </Sheet>
  );
}
