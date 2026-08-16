import pino from 'pino';
import { env } from '../config/env';

/**
 * Log estruturado. Nunca registra dado pessoal em claro: apenas ids.
 * `redact` cobre os caminhos que costumam vazar por engano.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'password',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tokenHash',
      'body.password',
      'body.token',
      'email',
      '*.email',
      'document',
      '*.document',
      'phonePrimary',
      '*.phonePrimary',
    ],
    censor: '[redacted]',
  },
  base: { service: 'chiron-api' },
  // Em teste o transporte por worker esconde a saída do runner: escrita direta.
  transport:
    process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'test'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/** Adaptador para o LoggerService do Nest. */
export class NestPinoLogger {
  log(message: unknown, context?: string): void {
    logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    logger.trace({ context }, String(message));
  }
}

// evita "unused" quando env não é lido em runtime aqui
void env;
