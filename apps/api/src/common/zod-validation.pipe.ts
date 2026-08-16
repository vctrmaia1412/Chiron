import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';
import { AppError } from './errors';

/**
 * Validação de entrada com os mesmos schemas usados pelo frontend
 * (`@chiron/contracts`). O servidor é a autoridade: nada entra sem passar aqui.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw AppError.validation('Dados inválidos.', {
          issues: error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        });
      }
      throw error;
    }
  }
}

export function zBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

export function zQuery<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
