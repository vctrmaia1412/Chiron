'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-medium transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-[var(--brand)] select-none',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] shadow-[var(--shadow-sm)]',
        secondary:
          'bg-[var(--surface)] text-[var(--ink)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
        ghost: 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
        subtle: 'bg-[var(--brand-soft)] text-[var(--brand-ink)] hover:bg-[#d5eae6]',
        danger: 'bg-[var(--danger)] text-white hover:bg-[#9c1e15]',
        dangerGhost: 'text-[var(--danger)] hover:bg-[var(--danger-soft)]',
        link: 'text-[var(--brand)] underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'h-10 w-10',
        iconSm: 'h-8 w-8',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      ref={ref}
      data-touch-target
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Component>
  );
});
