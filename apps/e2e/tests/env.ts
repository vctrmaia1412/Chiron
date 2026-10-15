import { join } from 'node:path';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3333/api/v1';
/** Senha dos usuários do seed de demonstração (nunca roda em produção). */
export const PASSWORD = process.env.E2E_PASSWORD ?? 'Chiron@2026';

export const ROLES = {
  vet: 'vet@chiron.dev',
  recepcao: 'recepcao@chiron.dev',
  tecnico: 'tecnico@chiron.dev',
  admin: 'admin@chiron.dev',
} as const;

export type Role = keyof typeof ROLES;

export function storageFor(role: Role): string {
  return join(__dirname, '..', '.auth', `${role}.json`);
}
