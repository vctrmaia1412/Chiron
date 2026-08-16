import { HttpException } from '@nestjs/common';
import { ERROR_CODES, HTTP_STATUS_BY_CODE, type ErrorCode } from '@chiron/contracts';
import { DomainError } from '@chiron/domain';

/**
 * Exceção da API no formato único `{ code, message, details, requestId }`.
 * O `requestId` é preenchido pelo filtro global.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, HTTP_STATUS_BY_CODE[code] ?? 500);
  }

  static notFound(what = 'Recurso'): AppError {
    return new AppError('NOT_FOUND', `${what} não encontrado.`);
  }

  static forbidden(message = 'Você não tem permissão para esta ação.', details?: unknown): AppError {
    return new AppError('FORBIDDEN', message, details);
  }

  static unauthenticated(message = 'Sessão inválida ou expirada.'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_FAILED', message, details);
  }
}

/** Converte erro de domínio (puro) em erro de API. */
export function fromDomainError(error: DomainError): AppError {
  const code = (ERROR_CODES as readonly string[]).includes(error.code)
    ? (error.code as ErrorCode)
    : 'VALIDATION_FAILED';
  return new AppError(code, error.message, error.details);
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof Error && error.name === 'DomainError';
}
