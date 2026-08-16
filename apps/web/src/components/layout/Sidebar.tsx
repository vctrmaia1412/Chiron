'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronsUpDown, LogOut, MapPin } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { initials } from '@/lib/format';
import { Logo } from '@/components/brand/logo';
import { NAV_ITEMS, isActivePath } from './navigation';

export function Sidebar() {
  const pathname = usePathname();
  const { can, hasModule } = useSession();

  const items = NAV_ITEMS.filter((item) => hasModule(item.module) && can(item.permission));

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
      <div className="flex h-[var(--header-h)] items-center border-b border-[var(--border)] px-4">
        <Logo className="h-7" />
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-[14px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                  )}
                >
                  <Icon className={cn('h-[18px] w-[18px]', active ? 'text-[var(--brand)]' : 'text-[var(--ink-3)]')} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <TenantSwitcher />

      <div className="border-t border-[var(--border)] p-3">
        <UserMenu />
      </div>
    </aside>
  );
}

export function TenantSwitcher({ compact }: { compact?: boolean }) {
  const { context, switchTenant, switchFacility } = useSession();
  if (!context?.tenant) return null;

  const multiTenant = context.availableTenants.length > 1;
  const multiFacility = context.facilities.length > 1;
  if (!multiTenant && !multiFacility) {
    return compact ? null : (
      <div className="border-t border-[var(--border)] px-4 py-3">
        <p className="truncate text-[13px] font-medium text-[var(--ink)]">{context.tenant.name}</p>
        {context.facility && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-[var(--ink-3)]">
            <MapPin className="h-3 w-3" />
            {context.facility.name}
          </p>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 text-left transition-colors hover:bg-[var(--surface-2)]',
            compact
              ? 'rounded-[var(--radius)] px-2 py-1.5'
              : 'border-t border-[var(--border)] px-4 py-3',
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[var(--ink)]">{context.tenant.name}</span>
            {context.facility && (
              <span className="block truncate text-[12px] text-[var(--ink-3)]">{context.facility.name}</span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="z-50 min-w-[240px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          {multiTenant && (
            <>
              <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Organização
              </DropdownMenu.Label>
              {context.availableTenants.map((tenant) => (
                <DropdownMenu.Item
                  key={tenant.id}
                  onSelect={() => {
                    if (tenant.id !== context.tenant?.id) void switchTenant(tenant.id);
                  }}
                  className={cn(
                    'cursor-pointer rounded-[var(--radius-sm)] px-2 py-2 text-[13.5px] outline-none',
                    tenant.id === context.tenant?.id
                      ? 'bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]'
                      : 'text-[var(--ink-2)] data-[highlighted]:bg-[var(--surface-2)]',
                  )}
                >
                  {tenant.name}
                </DropdownMenu.Item>
              ))}
            </>
          )}

          {multiFacility && (
            <>
              {multiTenant && <DropdownMenu.Separator className="my-1.5 h-px bg-[var(--border)]" />}
              <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Unidade
              </DropdownMenu.Label>
              {context.facilities.map((facility) => (
                <DropdownMenu.Item
                  key={facility.id}
                  onSelect={() => {
                    if (facility.id !== context.facility?.id) void switchFacility(facility.id);
                  }}
                  className={cn(
                    'cursor-pointer rounded-[var(--radius-sm)] px-2 py-2 text-[13.5px] outline-none',
                    facility.id === context.facility?.id
                      ? 'bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]'
                      : 'text-[var(--ink-2)] data-[highlighted]:bg-[var(--surface-2)]',
                  )}
                >
                  {facility.name}
                </DropdownMenu.Item>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function UserMenu() {
  const { context, logout } = useSession();
  if (!context) return null;

  const roleLabel = context.membership?.roles.map((r) => r.name).join(', ') ?? '';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-1.5 py-1.5 text-left hover:bg-[var(--surface-2)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[12px] font-semibold text-[var(--brand-ink)]">
            {initials(context.user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[var(--ink)]">{context.user.name}</span>
            <span className="block truncate text-[12px] text-[var(--ink-3)]">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="z-50 min-w-[220px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-[13px] font-medium text-[var(--ink)]">{context.user.name}</p>
            <p className="truncate text-[12px] text-[var(--ink-3)]">{context.user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1.5 h-px bg-[var(--border)]" />
          <DropdownMenu.Item asChild>
            <Link
              href="/configuracoes/sessoes"
              className="block cursor-pointer rounded-[var(--radius-sm)] px-2 py-2 text-[13.5px] text-[var(--ink-2)] outline-none data-[highlighted]:bg-[var(--surface-2)]"
            >
              Meus acessos
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-[13.5px] text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--danger-soft)]"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
