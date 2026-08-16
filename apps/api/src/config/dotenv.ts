import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carregador de .env minimalista: evita uma dependência para algo trivial.
 * Procura, na ordem, `.env.<APP_ENV>.local`, `.env.local`, `.env` a partir
 * da raiz do app e da raiz do monorepo. Variáveis já definidas no processo
 * têm precedência (o ambiente real sempre vence o arquivo).
 */
let loaded = false;

export function config(): void {
  if (loaded) return;
  loaded = true;

  const appEnv = process.env.APP_ENV ?? 'dev';
  const roots = [process.cwd(), resolve(process.cwd(), '..', '..'), resolve(process.cwd(), '..')];
  const names = [`.env.${appEnv}.local`, `.env.${appEnv}`, '.env.local', '.env'];

  for (const root of roots) {
    for (const name of names) {
      const file = resolve(root, name);
      if (!existsSync(file)) continue;
      applyFile(file);
    }
  }
}

function applyFile(file: string): void {
  const content = readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
