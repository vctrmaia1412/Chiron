'use client';

import { cloneElement, forwardRef, isValidElement, useId } from 'react';
import { cn } from '@/lib/cn';

const baseControl =
  'w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 ' +
  'text-[var(--ink)] placeholder:text-[var(--ink-3)] transition-colors ' +
  'focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-soft)] ' +
  'disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-3)] aria-[invalid=true]:border-[var(--danger)]';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseControl, 'h-11 md:h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(baseControl, 'py-2.5 leading-relaxed', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(baseControl, 'h-11 md:h-10 pr-8 appearance-none bg-no-repeat', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b807d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: 'right 10px center',
        }}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

const CONTROL_TYPES: unknown[] = ['input', 'select', 'textarea', Input, Select, Textarea];

/**
 * Rótulo, controle e mensagem ligados entre si. Quando o campo tem um único
 * controle (Input, Select, Textarea), o id é gerado e o rótulo aponta para
 * ele sozinho: leitor de tela anuncia o nome certo e tocar no rótulo foca o
 * campo, sem cada formulário precisar lembrar de `htmlFor`.
 */
export function Field({ label, hint, error, required, children, className, htmlFor }: FieldProps) {
  const generatedId = useId();
  let controlId = htmlFor;
  let content = children;

  if (!controlId && isValidElement<{ id?: string }>(children) && CONTROL_TYPES.includes(children.type)) {
    controlId = children.props.id ?? generatedId;
    if (!children.props.id) content = cloneElement(children, { id: controlId });
  }

  const messageId = controlId ? `${controlId}-mensagem` : undefined;
  if (controlId && isValidElement(content) && CONTROL_TYPES.includes(content.type)) {
    content = cloneElement(content as React.ReactElement<Record<string, unknown>>, {
      'aria-describedby': error || hint ? messageId : undefined,
      'aria-invalid': error ? true : undefined,
      'aria-required': required ? true : undefined,
    });
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={controlId} className="text-[13px] font-medium text-[var(--ink-2)]">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-[var(--danger)]">
              *
            </span>
          )}
        </label>
      )}
      {content}
      {error ? (
        <p id={messageId} className="text-[12.5px] text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[12.5px] text-[var(--ink-3)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Campo com id gerado, para quem não quer controlar htmlFor manualmente. */
export function LabeledInput({
  label,
  hint,
  error,
  required,
  className,
  ...props
}: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Input id={id} aria-invalid={Boolean(error)} required={required} {...props} />
    </Field>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: { label: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] py-1.5 text-sm text-[var(--ink-2)]',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[4px] border-[var(--border-strong)] accent-[var(--brand)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
