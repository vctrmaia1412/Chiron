/**
 * Indicador do conteúdo mínimo do prontuário (Res. CFMV 1.321/2020, art. 9º,
 * com a redação da Res. 1.653/2025). Não bloqueia nada: mostra ao veterinário
 * o que falta enquanto ele escreve, para que a finalização não vire surpresa e
 * para que ninguém precise preencher campo só para o sistema deixar passar.
 */
export interface CompletenessInput {
  noteKinds: Array<{ kind: string; body: string }>;
  observationCount: number;
  diagnosisCount: number;
}

export interface CompletenessItem {
  key: 'report' | 'exam' | 'diagnosis' | 'plan';
  label: string;
  done: boolean;
  hint: string;
}

function hasText(notes: CompletenessInput['noteKinds'], kinds: string[]): boolean {
  return notes.some((note) => kinds.includes(note.kind) && note.body.trim().length > 0);
}

export function recordCompleteness(input: CompletenessInput): CompletenessItem[] {
  const notes = input.noteKinds;
  return [
    {
      key: 'report',
      label: 'Relato do tutor',
      done: hasText(notes, ['chief_complaint', 'history', 'triage', 'free']),
      hint: 'Queixa ou histórico contado pelo responsável.',
    },
    {
      key: 'exam',
      label: 'Estado geral e exame',
      done: input.observationCount > 0 || hasText(notes, ['physical_exam', 'free']),
      hint: 'Parâmetros vitais ou achados do exame físico.',
    },
    {
      key: 'diagnosis',
      label: 'Diagnóstico presuntivo',
      done: input.diagnosisCount > 0 || hasText(notes, ['assessment']),
      hint: 'Um diagnóstico, mesmo que presuntivo, ou a avaliação clínica.',
    },
    {
      key: 'plan',
      label: 'Conduta',
      done: hasText(notes, ['plan']),
      hint: 'Tratamento, orientações e critério de retorno.',
    },
  ];
}
