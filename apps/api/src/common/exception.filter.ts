import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HTTP_STATUS_BY_CODE, type ErrorCode } from '@chiron/contracts';
import { AppError, isDomainError, fromDomainError } from './errors';
import { logger } from './logger';
import type { AuthedRequest } from './request-context';

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Resposta de erro única: `{ code, message, details?, requestId }`.
 * Erros de banco viram códigos estáveis; nada de vazar SQL para o cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<AuthedRequest>();
    const requestId = request?.requestId ?? 'unknown';

    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Erro interno. Tente novamente.';
    let details: unknown;
    let status = 500;

    if (isDomainError(exception)) {
      const appError = fromDomainError(exception);
      code = appError.code;
      message = appError.message;
      details = appError.details;
      status = HTTP_STATUS_BY_CODE[code] ?? 400;
    } else if (exception instanceof AppError) {
      const body = exception.getResponse() as { code: ErrorCode; message: string; details?: unknown };
      code = body.code;
      message = body.message;
      details = body.details;
      status = exception.getStatus();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      code =
        status === 404
          ? 'NOT_FOUND'
          : status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'FORBIDDEN'
              : status === 429
                ? 'RATE_LIMITED'
                : status === 413
                  ? 'PAYLOAD_TOO_LARGE'
                  : status >= 500
                    ? 'INTERNAL_ERROR'
                    : 'VALIDATION_FAILED';
    } else if (isDatabaseError(exception)) {
      const mapped = mapDatabaseError(exception);
      code = mapped.code;
      message = mapped.message;
      details = mapped.details;
      status = HTTP_STATUS_BY_CODE[code] ?? 500;
    }

    if (status >= 500) {
      logger.error(
        { err: exception, requestId, url: request?.url, method: request?.method, tenantId: request?.ctx?.tenantId },
        'Erro não tratado',
      );
    } else {
      logger.debug(
        { code, requestId, url: request?.url, method: request?.method, tenantId: request?.ctx?.tenantId },
        message,
      );
    }

    void reply.status(status).send({ code, message, details, requestId });
  }
}

function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof Error && typeof (error as DatabaseError).code === 'string';
}

function mapDatabaseError(error: DatabaseError): { code: ErrorCode; message: string; details?: unknown } {
  switch (error.code) {
    case '23505': // unique_violation
      if (error.constraint?.includes('no_overlap')) {
        return { code: 'CONFLICT', message: 'Já existe um agendamento nesse horário para o profissional.' };
      }
      return {
        code: 'CONFLICT',
        message: 'Já existe um registro com esses dados.',
        details: { constraint: error.constraint },
      };
    case '23503': // foreign_key_violation
      return {
        code: 'VALIDATION_FAILED',
        message: 'Referência inválida: o registro relacionado não existe nesta organização.',
        details: { constraint: error.constraint },
      };
    case '23514': // check_violation
      return {
        code: 'CONFLICT',
        message: dbCheckMessage(error),
        details: { constraint: error.constraint },
      };
    case '23P01': // exclusion_violation
      return { code: 'CONFLICT', message: 'Conflito de horário: já existe agendamento nesse intervalo.' };
    case '22P02': // invalid_text_representation (uuid, número, data malformados)
      return { code: 'VALIDATION_FAILED', message: 'Identificador ou valor em formato inválido.' };
    case '42501': // insufficient_privilege (triggers append-only)
      return { code: 'FORBIDDEN', message: 'Operação não permitida sobre um registro imutável.' };
    default:
      return { code: 'INTERNAL_ERROR', message: 'Erro interno ao acessar os dados.' };
  }
}

function dbCheckMessage(error: DatabaseError): string {
  const text = `${error.message} ${error.detail ?? ''}`;
  if (text.includes('Nota assinada') || text.includes('Transição de nota')) {
    return 'Nota clínica assinada não pode ser alterada. Registre um adendo.';
  }
  if (text.includes('Receita assinada') || text.includes('Transição de receita')) {
    return 'Receita assinada não pode ser alterada. Cancele e emita uma nova.';
  }
  if (text.includes('append-only')) {
    return 'Este registro é imutável por auditoria.';
  }
  return 'Operação viola uma regra de integridade dos dados.';
}
