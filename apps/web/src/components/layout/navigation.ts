import type { ModuleKey } from '@chiron/contracts';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  PawPrint,
  ScrollText,
  Settings,
  Syringe,
  Users,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  permission: string;
  /** Aparece na barra inferior do celular. */
  primary?: boolean;
}

/**
 * Um único mapa de navegação alimenta o menu lateral e a barra inferior.
 * Cada item declara o módulo e a permissão que o tornam visível, e a
 * verificação usa exatamente as mesmas chaves que o backend exige.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Painel',
    icon: LayoutDashboard,
    module: 'core',
    permission: 'tenant:read',
    primary: true,
  },
  {
    href: '/agenda',
    label: 'Agenda',
    icon: CalendarDays,
    module: 'scheduling',
    permission: 'appointment:read',
    primary: true,
  },
  {
    href: '/atendimentos',
    label: 'Atendimentos',
    shortLabel: 'Fila',
    icon: ClipboardList,
    module: 'clinical',
    permission: 'encounter:read',
    primary: true,
  },
  {
    href: '/pacientes',
    label: 'Pacientes',
    icon: PawPrint,
    module: 'core',
    permission: 'patient:read',
    primary: true,
  },
  {
    href: '/tutores',
    label: 'Tutores',
    icon: Users,
    module: 'core',
    permission: 'guardian:read',
  },
  {
    href: '/exames',
    label: 'Exames',
    icon: FlaskConical,
    module: 'lab',
    permission: 'exam_order:read',
  },
  {
    href: '/vacinas',
    label: 'Vacinas',
    icon: Syringe,
    module: 'immunization',
    permission: 'immunization:read',
  },
  {
    href: '/documentos',
    label: 'Documentos',
    icon: FileText,
    module: 'documents',
    permission: 'document:read',
  },
  {
    href: '/auditoria',
    label: 'Auditoria',
    icon: ScrollText,
    module: 'core',
    permission: 'audit:read',
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    shortLabel: 'Config',
    icon: Settings,
    module: 'core',
    permission: 'tenant:read',
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
