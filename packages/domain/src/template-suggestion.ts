/**
 * Qual modelo oferecer quando o veterinário abre um registro vazio. A queixa
 * contada na recepção manda primeiro ("coçando a orelha" sugere otite); sem
 * nenhuma palavra reconhecida, vale o tipo de serviço (vacinação sugere o
 * modelo de vacina). É só uma sugestão de um toque: ignorar não custa nada.
 */
export interface SuggestibleTemplate {
  kind: string;
  keywords: string[];
  serviceCategories: string[];
}

function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function suggestTemplate<T extends SuggestibleTemplate>(
  templates: T[],
  context: { complaint?: string | null; serviceCategory?: string | null },
): T | undefined {
  const full = templates.filter((template) => template.kind === 'template');
  const complaint = plain(context.complaint ?? '');

  if (complaint.trim()) {
    let best: T | undefined;
    let bestScore = 0;
    for (const template of full) {
      const score = template.keywords.filter((keyword) => keyword && complaint.includes(plain(keyword))).length;
      if (score > bestScore) {
        best = template;
        bestScore = score;
      }
    }
    if (best) return best;
  }

  const category = context.serviceCategory;
  return category ? full.find((template) => template.serviceCategories.includes(category)) : undefined;
}
