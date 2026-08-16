/**
 * Erros de domínio: puros, sem dependência de HTTP.
 * A camada de aplicação traduz `code` para o formato de erro da API.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function invalidTransition(entity: string, from: string, to: string): DomainError {
  return new DomainError(
    'INVALID_STATE_TRANSITION',
    `Transição inválida em ${entity}: ${from} para ${to}.`,
    { entity, from, to },
  );
}
