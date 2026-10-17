import { createHash, randomBytes } from 'node:crypto';

/**
 * UUID v7 (RFC 9562): 48 bits de timestamp em milissegundos + aleatório.
 * Ordenável no tempo, sem revelar contagem, gerado na aplicação.
 */
export function uuidv7(date = new Date()): string {
  const timestamp = BigInt(date.getTime());
  const bytes = randomBytes(16);

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // versão 7
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  // variante RFC 4122
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * UUID v5 (RFC 9562, SHA-1 com espaço de nomes): o mesmo nome dá sempre o
 * mesmo id. Serve para dado de referência que não tem chave natural no
 * banco, como modelos de fábrica, e precisa de `ON CONFLICT (id)` idempotente.
 */
export function stableUuid(name: string, namespace = '6f1c2b8e-3d4a-5e6f-8a9b-0c1d2e3f4a5b'): string {
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name)
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
