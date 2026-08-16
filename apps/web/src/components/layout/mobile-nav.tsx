'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { Sheet } from '@/components/ui/sheet';
import { NAV_ITEMS, isActivePath } from './navigation';
import { TenantSwitcher, UserMenu } from './sidebar';

/**
 * Barra inferior fixa: os quatro destinos de uso diário ficam ao alcance do
 * polegar, e o resto entra em uma folha. Nada de menu sanduíche no topo, que
 * é o canto mais difícil de alcançar em telefone grande.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { can, hasModule } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const available = NAV_ITEMS.filter((item) => hasModule(item.module) && can(item.permission));
  const primary = available.filter((item) => item.primary).slice(0, 4);
  const rest = available.filter((item) => !primary.includes(item));

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden">
        <ul className="flex h-[var(--mobilenav-h)] items-stretch">
          {primary.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                    active ? 'text-[var(--brand)]' : 'text-[var(--ink-3)]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.shortLabel ?? item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--ink-3)]"
            >
              <Menu className="h-5 w-5" />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" size="sm">
        <div className="space-y-1">
          {rest.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius)] px-3 py-3 text-[15px] font-medium',
                  active ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'text-[var(--ink-2)]',
                )}
              >
                <Icon className="h-5 w-5 text-[var(--ink-3)]" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
          <TenantSwitcher compact />
          <UserMenu />
        </div>
      </Sheet>
    </>
  );
}
