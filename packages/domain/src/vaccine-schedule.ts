/**
 * Protocolo vacinal: a série primária tem intervalos próprios entre doses e,
 * concluída a série, vale o intervalo de reforço. Com isso o veterinário
 * escolhe "V10" e o sistema sabe que é a 2ª dose e que a próxima vence em 21
 * dias, em vez de alguém digitar número de dose e data a cada aplicação.
 */
export interface ProtocolStep {
  label: string;
  /** Dias até a próxima dose; nulo na última dose da série primária. */
  intervalToNextDays: number | null;
}

export interface ProtocolDefinition {
  steps: ProtocolStep[];
  boosterIntervalDays: number | null;
}

export interface NextDose {
  doseNumber: number;
  label: string;
  /** Dias até a dose seguinte à que está sendo aplicada agora. */
  nextIntervalDays: number | null;
}

/**
 * A partir de quantas doses já foram aplicadas, devolve a dose de agora e o
 * intervalo para a seguinte. Série concluída vira reforço.
 */
export function nextDoseFor(protocol: ProtocolDefinition, dosesGiven: number): NextDose {
  const index = Math.max(0, dosesGiven);
  const step = protocol.steps[index];

  if (step) {
    const isLastOfSeries = index === protocol.steps.length - 1;
    return {
      doseNumber: index + 1,
      label: step.label,
      nextIntervalDays: step.intervalToNextDays ?? (isLastOfSeries ? protocol.boosterIntervalDays : null),
    };
  }

  return {
    doseNumber: index + 1,
    label: 'Reforço',
    nextIntervalDays: protocol.boosterIntervalDays,
  };
}

/** Data ISO (aaaa-mm-dd) somando dias a partir de uma data de referência. */
export function addDaysIso(reference: Date, days: number): string {
  const result = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
