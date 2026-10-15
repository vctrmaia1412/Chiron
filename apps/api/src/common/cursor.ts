import { AppError } from './errors';

/**
 * Cursor de paginação por (created_at, id). Só a data não basta: cadastro
 * importado em lote nasce com o mesmo created_at, e a página seguinte pularia
 * linhas. A data vai como o texto do próprio Postgres, com microssegundos,
 * porque o Date do JavaScript corta em milissegundos.
 */
export interface KeysetCursor {
  at: string;
  id: string | null;
}

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): KeysetCursor | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return { at: parsed[0], id: parsed[1] };
    }
  } catch {
    // cursor antigo, só com a data: continua aceito
  }
  if (!Number.isNaN(Date.parse(cursor))) return { at: cursor, id: null };
  throw AppError.validation('Cursor de paginação inválido.');
}
