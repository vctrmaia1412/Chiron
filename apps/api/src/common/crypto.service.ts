import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env';

const CURRENT_KEY_ID = 1;

/**
 * Criptografia de coluna (CPF/CNPJ, segredos) com AES-256-GCM e prefixo de
 * versão da chave, permitindo rotação gradual. O índice cego usa HMAC com
 * chave própria: hash simples de CPF é reversível por enumeração.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly hashKey: string;

  constructor() {
    const cfg = env();
    this.key = scryptSync(cfg.COLUMN_ENCRYPTION_KEY, 'chiron-column-v1', 32);
    this.hashKey = cfg.COLUMN_HASH_KEY;
  }

  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v${CURRENT_KEY_ID}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length !== 4 || !parts[0]?.startsWith('v')) return null;
    const [, ivB64, tagB64, dataB64] = parts;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64 as string, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64 as string, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataB64 as string, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  /** Índice cego para busca por igualdade (CPF/CNPJ). */
  blindIndex(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.replace(/\D/g, '');
    if (!normalized) return null;
    return createHmac('sha256', this.hashKey).update(normalized).digest('hex');
  }

  /** Máscara para exibição: mantém só os últimos dígitos. */
  mask(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length === 14) return `**.***.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    return `***${digits.slice(-3)}`;
  }

  /** Hash de token de uso único (convite, reset de senha). */
  tokenHash(token: string): string {
    return createHmac('sha256', this.hashKey).update(token).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}
