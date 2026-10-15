/**
 * Exame físico "normal por padrão". O veterinário marca o que está alterado e
 * descreve só isso; o resto entra com o texto de normalidade da espécie. É o
 * oposto do formulário com um campo por parâmetro: o registro nasce completo e
 * o profissional gasta tempo apenas com o achado que importa.
 */
export interface ExamSystem {
  key: string;
  label: string;
  normal: string;
}

export type ExamGroup =
  | 'small_animal'
  | 'exotic_mammal'
  | 'bird'
  | 'reptile'
  | 'equine'
  | 'ruminant'
  | 'swine'
  | 'generic';

const GENERAL: ExamSystem = { key: 'general', label: 'Estado geral', normal: 'alerta, responsivo, bom estado geral' };
const HYDRATION: ExamSystem = { key: 'hydration', label: 'Hidratação', normal: 'normo-hidratado' };
const LYMPH: ExamSystem = { key: 'lymph', label: 'Linfonodos', normal: 'sem linfadenomegalia' };
const EYES: ExamSystem = { key: 'eyes', label: 'Olhos', normal: 'sem secreção, córneas transparentes' };

const SYSTEMS: Record<ExamGroup, ExamSystem[]> = {
  small_animal: [
    GENERAL,
    HYDRATION,
    { key: 'mucosa', label: 'Mucosas', normal: 'normocoradas, úmidas, TPC < 2 s' },
    LYMPH,
    { key: 'cardio', label: 'Cardiovascular', normal: 'bulhas normofonéticas, ritmo regular, sem sopros; pulso forte e sincrônico' },
    { key: 'respiratory', label: 'Respiratório', normal: 'eupneico, campos pulmonares limpos à auscultação' },
    { key: 'abdomen', label: 'Abdômen', normal: 'normotenso, indolor à palpação, sem massas palpáveis' },
    { key: 'skin', label: 'Pele e pelagem', normal: 'íntegras, sem lesões ou ectoparasitas' },
    { key: 'ears', label: 'Ouvidos', normal: 'condutos limpos, sem secreção ou eritema' },
    EYES,
    { key: 'oral', label: 'Cavidade oral', normal: 'sem alterações dignas de nota' },
    { key: 'locomotor', label: 'Locomotor', normal: 'deambulação normal, sem dor à palpação' },
    { key: 'neuro', label: 'Neurológico', normal: 'sem déficits aparentes' },
    { key: 'urogenital', label: 'Urogenital', normal: 'sem alterações à inspeção' },
  ],
  exotic_mammal: [
    GENERAL,
    HYDRATION,
    { key: 'mucosa', label: 'Mucosas', normal: 'róseas e úmidas' },
    { key: 'teeth', label: 'Dentes', normal: 'incisivos e molares sem sobrecrescimento' },
    { key: 'respiratory', label: 'Respiratório', normal: 'sem secreção nasal, auscultação limpa' },
    { key: 'abdomen', label: 'Abdômen', normal: 'motilidade presente, sem timpanismo ou dor' },
    { key: 'skin', label: 'Pele e pelagem', normal: 'íntegras, sem alopecia ou ectoparasitas' },
    { key: 'ears', label: 'Ouvidos', normal: 'sem secreção ou crostas' },
    EYES,
  ],
  bird: [
    GENERAL,
    { key: 'body_condition', label: 'Escore corporal', normal: 'musculatura peitoral adequada, quilha pouco evidente' },
    { key: 'feathers', label: 'Plumagem', normal: 'íntegra, sem falhas ou barras de estresse' },
    { key: 'eyes_nares', label: 'Olhos e narinas', normal: 'sem secreção' },
    { key: 'beak', label: 'Bico e cavidade oral', normal: 'sem alterações' },
    { key: 'respiratory', label: 'Respiratório', normal: 'sem esforço, sem movimento de cauda' },
    { key: 'cloaca', label: 'Cloaca', normal: 'limpa, sem prolapso' },
    { key: 'feet', label: 'Pés', normal: 'sem lesões plantares' },
  ],
  reptile: [
    { key: 'general', label: 'Estado geral', normal: 'alerta e reativo' },
    { key: 'body_condition', label: 'Escore corporal', normal: 'adequado' },
    { key: 'skin', label: 'Pele e escamas', normal: 'muda completa, sem retenção ou lesões' },
    EYES,
    { key: 'oral', label: 'Cavidade oral', normal: 'mucosa rósea, sem estomatite' },
    { key: 'respiratory', label: 'Respiratório', normal: 'sem ruídos ou secreção' },
    { key: 'cloaca', label: 'Cloaca', normal: 'sem alterações' },
  ],
  equine: [
    { key: 'general', label: 'Estado geral', normal: 'alerta, bom escore corporal' },
    HYDRATION,
    { key: 'mucosa', label: 'Mucosas', normal: 'róseas, úmidas, TPC < 2 s' },
    LYMPH,
    { key: 'cardio', label: 'Cardiovascular', normal: 'ritmo regular, sem sopros' },
    { key: 'respiratory', label: 'Respiratório', normal: 'eupneico, sem secreção nasal, auscultação traqueal e pulmonar limpa' },
    { key: 'gut', label: 'Motilidade intestinal', normal: 'borborigmos presentes nos quatro quadrantes' },
    { key: 'locomotor', label: 'Locomotor', normal: 'sem claudicação ao passo; cascos e pulso digital sem alterações' },
    { key: 'skin', label: 'Pele', normal: 'sem lesões' },
    EYES,
  ],
  ruminant: [
    { key: 'general', label: 'Estado geral', normal: 'alerta, bom escore corporal' },
    HYDRATION,
    { key: 'mucosa', label: 'Mucosas', normal: 'róseas, úmidas' },
    LYMPH,
    { key: 'cardio', label: 'Cardiovascular', normal: 'ritmo regular, sem abafamento de bulhas' },
    { key: 'respiratory', label: 'Respiratório', normal: 'eupneico, auscultação limpa' },
    { key: 'rumen', label: 'Rúmen', normal: 'movimentos presentes (2 a 3 em 2 min), estratificação normal' },
    { key: 'udder', label: 'Glândula mamária', normal: 'sem alterações à inspeção e palpação; leite de aspecto normal' },
    { key: 'locomotor', label: 'Locomotor', normal: 'aprumos e cascos sem alterações' },
  ],
  swine: [
    { key: 'general', label: 'Estado geral', normal: 'alerta, bom escore corporal' },
    { key: 'skin', label: 'Pele', normal: 'sem lesões ou ectoparasitas' },
    { key: 'mucosa', label: 'Mucosas', normal: 'róseas' },
    { key: 'respiratory', label: 'Respiratório', normal: 'sem tosse, espirro ou dispneia' },
    { key: 'digestive', label: 'Digestório', normal: 'fezes de consistência normal' },
    { key: 'locomotor', label: 'Locomotor', normal: 'sem claudicação' },
  ],
  generic: [
    GENERAL,
    { key: 'behavior', label: 'Comportamento', normal: 'compatível com a espécie' },
    { key: 'body_condition', label: 'Escore corporal', normal: 'adequado' },
    { key: 'skin', label: 'Tegumento', normal: 'sem lesões' },
    { key: 'respiratory', label: 'Respiratório', normal: 'sem esforço respiratório' },
  ],
};

const GROUP_BY_SPECIES: Record<string, ExamGroup> = {
  dog: 'small_animal',
  cat: 'small_animal',
  ferret: 'small_animal',
  rabbit: 'exotic_mammal',
  rodent: 'exotic_mammal',
  bird: 'bird',
  poultry: 'bird',
  reptile: 'reptile',
  horse: 'equine',
  donkey: 'equine',
  cattle: 'ruminant',
  sheep: 'ruminant',
  goat: 'ruminant',
  swine: 'swine',
};

export function examGroupFor(speciesCode: string | null | undefined): ExamGroup {
  return (speciesCode && GROUP_BY_SPECIES[speciesCode]) || 'generic';
}

export function examSystemsFor(speciesCode: string | null | undefined): ExamSystem[] {
  return SYSTEMS[examGroupFor(speciesCode)];
}

export interface ExamFinding {
  /** Texto do achado. Vazio ou ausente significa "sem alterações". */
  abnormal?: string | null;
  /** Sistema não avaliado: fica fora do texto. */
  skipped?: boolean;
}

/**
 * Monta o texto do exame físico. Alterados vêm primeiro, marcados, porque é
 * o que o próximo leitor procura; os normais seguem em uma linha por sistema.
 */
export function composePhysicalExam(systems: ExamSystem[], findings: Record<string, ExamFinding>): string {
  const abnormal: string[] = [];
  const normal: string[] = [];

  for (const system of systems) {
    const finding = findings[system.key];
    if (finding?.skipped) continue;
    const text = finding?.abnormal?.trim();
    if (text) {
      abnormal.push(`${system.label} (alterado): ${text.replace(/\.+$/, '')}.`);
    } else {
      normal.push(`${system.label}: ${system.normal}.`);
    }
  }

  return [...abnormal, ...normal].join('\n');
}
