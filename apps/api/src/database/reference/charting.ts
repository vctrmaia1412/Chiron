import type { ChartingSection } from '@chiron/contracts';

/**
 * Conteúdo de fábrica para o registro rápido. O produto precisa funcionar bem
 * no primeiro turno, sem ninguém configurar nada: é isso que separa um
 * sistema que ajuda de um que exige implementador. A clínica cria os seus
 * modelos por cima destes, e os globais nunca são editados por ela.
 *
 * Os textos são ponto de partida: o veterinário revisa e completa antes de
 * assinar. Lacunas aparecem como "__" para o olho achar rápido o que falta.
 */

export interface NoteTemplateSeed {
  key: string;
  kind: 'template' | 'snippet';
  name: string;
  shortcut: string;
  species?: string[];
  serviceCategories?: string[];
  /** Termos da queixa (sem acento, minúsculos) que fazem a tela sugerir o modelo. */
  keywords?: string[];
  sections?: Partial<Record<ChartingSection, string>>;
  body?: string;
}

const SMALL = ['dog', 'cat'];

export const NOTE_TEMPLATES: NoteTemplateSeed[] = [
  {
    key: 'consulta-geral',
    kind: 'template',
    name: 'Consulta clínica',
    shortcut: 'consulta',
    serviceCategories: ['consultation'],
    sections: {
      history:
        'Alimentação: __\nVacinação e vermifugação: __\nAmbiente e contactantes: __\nMedicações em uso: __',
      plan: 'Conduta: __\nOrientações ao tutor: __\nRetorno: __',
    },
  },
  {
    key: 'vacinacao',
    kind: 'template',
    name: 'Vacinação de rotina',
    shortcut: 'vacina',
    serviceCategories: ['vaccination', 'preventive'],
    keywords: ['vacina', 'vacinacao', 'reforco'],
    sections: {
      chief_complaint: 'Vacinação de rotina.',
      history: 'Tutor não relata queixas. Apetite, ingestão hídrica, fezes e urina normais.',
      assessment: 'Paciente hígido ao exame, apto à vacinação.',
      plan:
        'Vacina aplicada conforme protocolo. Orientado sobre reações possíveis nas próximas 24 a 48 h (dor no local, febre baixa, apatia) e a retornar em caso de inchaço no rosto, vômito ou dificuldade respiratória.',
    },
  },
  {
    key: 'retorno',
    kind: 'template',
    name: 'Retorno / reavaliação',
    shortcut: 'retorno',
    serviceCategories: ['return'],
    keywords: ['retorno', 'reavaliacao'],
    sections: {
      chief_complaint: 'Retorno para reavaliação de __.',
      history: 'Tutor relata: __\nAdesão ao tratamento: __',
      assessment: 'Evolução: __',
      plan: 'Conduta: __',
    },
  },
  {
    key: 'otite',
    kind: 'template',
    name: 'Otite externa',
    shortcut: 'otite',
    species: SMALL,
    keywords: ['orelha', 'ouvido', 'otite', 'balanca a cabeca', 'chacoalha a cabeca', 'meneio'],
    sections: {
      chief_complaint: 'Prurido auricular e meneios cefálicos.',
      history: 'Início há __ dias. Episódios anteriores: __. Banho ou piscina recentes: __.',
      assessment: 'Otite externa (presuntiva). Investigar causa primária se recorrente.',
      plan:
        'Limpeza otológica no consultório. Citologia de conduto se recorrente. Tratamento tópico conforme receita. Retorno para reavaliação.',
    },
  },
  {
    key: 'gastro',
    kind: 'template',
    name: 'Vômito e diarreia',
    shortcut: 'gastro',
    species: SMALL,
    keywords: ['vomito', 'vomitando', 'diarreia', 'fezes moles', 'nao come', 'enjoo'],
    sections: {
      chief_complaint: 'Vômito e/ou diarreia.',
      history:
        'Início: __. Frequência: __. Aspecto do vômito e das fezes: __. Acesso a lixo, osso ou objeto: __. Mudança de alimentação: __.',
      assessment: 'Gastroenterite aguda (presuntiva). Diferenciais: corpo estranho, parasitismo, pancreatite.',
      plan:
        'Dieta leve e fracionada, hidratação e sintomáticos conforme receita. Retornar se vômito persistir, houver sangue ou apatia.',
    },
  },
  {
    key: 'prurido',
    kind: 'template',
    name: 'Prurido / dermatopatia',
    shortcut: 'prurido',
    species: SMALL,
    keywords: ['coceira', 'cocando', 'prurido', 'lambendo', 'queda de pelo', 'ferida na pele', 'pulga'],
    sections: {
      chief_complaint: 'Prurido e lesões de pele.',
      history:
        'Início: __. Distribuição: __. Sazonalidade: __. Controle de pulgas: __. Dieta: __. Contactantes com lesão: __.',
      assessment: 'Dermatopatia pruriginosa. Diferenciais: DAPP, dermatite atópica, sarna, piodermite, dermatofitose.',
      plan: 'Raspado e citologia de pele. Controle de ectoparasitas. Tratamento conforme receita. Retorno para reavaliação.',
    },
  },
  {
    key: 'checkup',
    kind: 'template',
    name: 'Check-up / geriátrico',
    shortcut: 'checkup',
    keywords: ['check-up', 'checkup', 'preventiv', 'geriatr', 'idoso', 'rotina anual'],
    sections: {
      chief_complaint: 'Avaliação preventiva.',
      history:
        'Apetite: __. Ingestão de água: __. Urina e fezes: __. Atividade e disposição: __. Tosse, cansaço ou desmaio: __.',
      plan: 'Exames de rotina conforme idade (hemograma, bioquímico, urinálise). Retorno com resultados.',
    },
  },
  {
    key: 'pos-operatorio',
    kind: 'template',
    name: 'Pós-operatório / retirada de pontos',
    shortcut: 'pontos',
    serviceCategories: ['procedure'],
    keywords: ['pontos', 'pos-operatorio', 'pos operatorio', 'castracao', 'cirurgia'],
    sections: {
      chief_complaint: 'Retorno pós-operatório.',
      history: 'Cirurgia em __. Uso do colar e da medicação: __.',
      assessment: 'Ferida cirúrgica __.',
      plan: 'Retirada de pontos realizada. Liberado para atividades normais em __ dias.',
    },
  },
  {
    key: 'colica-equina',
    kind: 'template',
    name: 'Cólica equina',
    shortcut: 'colica',
    species: ['horse', 'donkey'],
    keywords: ['colica', 'rolando', 'olhando o flanco', 'cavando', 'dor abdominal'],
    sections: {
      chief_complaint: 'Desconforto abdominal.',
      history:
        'Início: __. Última defecação: __. Alimentação e água: __. Sinais: rolar, olhar o flanco, cavar: __. Mudança de manejo: __.',
      assessment: 'Síndrome cólica. Classificação conforme FC, motilidade, refluxo e palpação retal.',
      plan: 'Analgesia conforme receita. Sondagem nasogástrica e palpação retal conforme achados. Reavaliar em __ h.',
    },
  },
  {
    key: 'mastite',
    kind: 'template',
    name: 'Mastite',
    shortcut: 'mastite',
    species: ['cattle', 'goat', 'sheep'],
    keywords: ['mastite', 'leite', 'teta', 'ubere', 'cmt', 'queda de producao'],
    sections: {
      chief_complaint: 'Alteração no leite ou queda de produção.',
      history: 'Quarto(s) afetado(s): __. CMT: __. Dias em lactação: __. Tratamentos anteriores: __.',
      assessment: 'Mastite clínica (presuntiva).',
      plan:
        'Tratamento conforme receita. Descartar o leite durante o tratamento e respeitar a carência indicada. Cultura do leite se recorrente.',
    },
  },
  {
    key: 'sem-queixas',
    kind: 'snippet',
    name: 'Sem queixas',
    shortcut: 'semqueixas',
    body: 'Tutor não relata queixas. Apetite, ingestão hídrica, fezes e urina normais.',
  },
  {
    key: 'nada-digno',
    kind: 'snippet',
    name: 'Sem alterações dignas de nota',
    shortcut: 'sad',
    body: 'Sem alterações dignas de nota.',
  },
  {
    key: 'retorno-piora',
    kind: 'snippet',
    name: 'Retornar se piorar',
    shortcut: 'piora',
    body: 'Retornar imediatamente em caso de piora, apatia, recusa alimentar ou vômitos persistentes.',
  },
  {
    key: 'reacao-vacinal',
    kind: 'snippet',
    name: 'Orientação de reação vacinal',
    shortcut: 'reacao',
    body:
      'Orientado sobre reações possíveis nas próximas 24 a 48 h (dor no local, febre baixa, apatia) e a retornar em caso de inchaço no rosto, vômito ou dificuldade respiratória.',
  },
  {
    key: 'jejum',
    kind: 'snippet',
    name: 'Jejum pré-procedimento',
    shortcut: 'jejum',
    body: 'Jejum alimentar de 8 h e hídrico de 2 h antes do procedimento.',
  },
  {
    key: 'colar',
    kind: 'snippet',
    name: 'Colar elizabetano',
    shortcut: 'colar',
    body: 'Usar colar elizabetano até a retirada dos pontos. Não permitir lambedura da ferida.',
  },
  {
    key: 'carencia',
    kind: 'snippet',
    name: 'Carência de carne e leite',
    shortcut: 'carencia',
    body: 'Respeitar o período de carência de carne e leite indicado na receita antes do abate ou da venda do leite.',
  },
];

export interface VaccineProtocolSeed {
  key: string;
  species: string;
  name: string;
  steps: Array<{ label: string; intervalToNextDays: number | null }>;
  boosterIntervalDays: number | null;
}

const series = (count: number, interval: number) =>
  Array.from({ length: count }, (_, index) => ({
    label: `${index + 1}ª dose`,
    intervalToNextDays: index === count - 1 ? null : interval,
  }));

const single = [{ label: 'Dose única', intervalToNextDays: null }];

/**
 * Protocolos sugeridos, não prescritos: o intervalo vem pronto e o veterinário
 * ajusta a data quando a bula ou a avaliação pedirem outra coisa.
 */
export const VACCINE_PROTOCOLS: VaccineProtocolSeed[] = [
  { key: 'dog-polivalente', species: 'dog', name: 'V8/V10 (polivalente)', steps: series(3, 21), boosterIntervalDays: 365 },
  { key: 'dog-raiva', species: 'dog', name: 'Antirrábica', steps: single, boosterIntervalDays: 365 },
  { key: 'dog-gripe', species: 'dog', name: 'Gripe canina (tosse dos canis)', steps: series(2, 21), boosterIntervalDays: 365 },
  { key: 'dog-giardia', species: 'dog', name: 'Giárdia', steps: series(2, 21), boosterIntervalDays: 365 },
  { key: 'dog-leish', species: 'dog', name: 'Leishmaniose', steps: series(3, 21), boosterIntervalDays: 365 },
  { key: 'cat-polivalente', species: 'cat', name: 'V4/V5 (polivalente felina)', steps: series(3, 21), boosterIntervalDays: 365 },
  { key: 'cat-raiva', species: 'cat', name: 'Antirrábica', steps: single, boosterIntervalDays: 365 },
  { key: 'horse-influenza', species: 'horse', name: 'Influenza equina', steps: series(2, 30), boosterIntervalDays: 365 },
  { key: 'horse-encefalo', species: 'horse', name: 'Encefalomielite equina', steps: series(2, 30), boosterIntervalDays: 365 },
  { key: 'horse-tetano', species: 'horse', name: 'Tétano', steps: series(2, 30), boosterIntervalDays: 365 },
  { key: 'horse-raiva', species: 'horse', name: 'Antirrábica', steps: single, boosterIntervalDays: 365 },
  { key: 'cattle-brucelose', species: 'cattle', name: 'Brucelose (B19, fêmeas de 3 a 8 meses)', steps: single, boosterIntervalDays: null },
  { key: 'cattle-clostridioses', species: 'cattle', name: 'Clostridioses', steps: series(2, 30), boosterIntervalDays: 365 },
  { key: 'cattle-raiva', species: 'cattle', name: 'Antirrábica', steps: series(2, 30), boosterIntervalDays: 365 },
];

export interface ConditionSeed {
  code: string;
  name: string;
  species?: string[];
}

const RUMINANT = ['cattle', 'sheep', 'goat'];
const EQUINE = ['horse', 'donkey'];
const SMALL_RUMINANT = ['sheep', 'goat'];

/**
 * Diagnósticos frequentes em português, para busca com autocompletar. Não é
 * uma terminologia completa (VeNom e SNOMED ficam para quando houver tradução
 * e licença resolvidas); é a lista que cobre o dia a dia e evita a mesma
 * doença escrita de cinco jeitos. O que não estiver aqui continua podendo ser
 * digitado livremente.
 */
export const CONDITIONS: ConditionSeed[] = [
  // gerais
  { code: 'higido', name: 'Paciente hígido (avaliação de rotina)' },
  { code: 'trauma', name: 'Trauma' },
  { code: 'fratura', name: 'Fratura' },
  { code: 'abscesso', name: 'Abscesso' },
  { code: 'ferida', name: 'Ferida cutânea' },
  { code: 'mordedura', name: 'Lesão por mordedura' },
  { code: 'intoxicacao', name: 'Intoxicação' },
  { code: 'neoplasia', name: 'Neoplasia (a esclarecer)' },
  { code: 'obesidade', name: 'Obesidade' },
  { code: 'desidratacao', name: 'Desidratação' },
  { code: 'anemia', name: 'Anemia' },
  { code: 'verminose', name: 'Verminose intestinal' },
  { code: 'ectoparasitose', name: 'Ectoparasitose' },
  { code: 'conjuntivite', name: 'Conjuntivite' },
  { code: 'pneumonia', name: 'Pneumonia' },
  { code: 'raiva-suspeita', name: 'Raiva (suspeita, notificação obrigatória)' },
  // cão e gato
  { code: 'otite-externa', name: 'Otite externa', species: SMALL },
  { code: 'otohematoma', name: 'Otohematoma', species: SMALL },
  { code: 'dermatite-atopica', name: 'Dermatite atópica', species: SMALL },
  { code: 'dapp', name: 'Dermatite alérgica à picada de pulga (DAPP)', species: SMALL },
  { code: 'hipersensibilidade-alimentar', name: 'Hipersensibilidade alimentar', species: SMALL },
  { code: 'piodermite', name: 'Piodermite superficial', species: SMALL },
  { code: 'demodicose', name: 'Sarna demodécica', species: SMALL },
  { code: 'sarna-sarcoptica', name: 'Sarna sarcóptica', species: SMALL },
  { code: 'dermatofitose', name: 'Dermatofitose', species: [...SMALL, 'rabbit', 'rodent'] },
  { code: 'malasseziose', name: 'Dermatite por Malassezia', species: SMALL },
  { code: 'gastroenterite', name: 'Gastroenterite aguda', species: SMALL },
  { code: 'gastrite', name: 'Gastrite', species: SMALL },
  { code: 'corpo-estranho-gi', name: 'Corpo estranho gastrointestinal', species: SMALL },
  { code: 'pancreatite', name: 'Pancreatite', species: SMALL },
  { code: 'parvovirose', name: 'Parvovirose canina', species: ['dog'] },
  { code: 'cinomose', name: 'Cinomose', species: ['dog'] },
  { code: 'giardiase', name: 'Giardíase', species: SMALL },
  { code: 'doenca-periodontal', name: 'Doença periodontal', species: SMALL },
  { code: 'ulcera-cornea', name: 'Úlcera de córnea', species: SMALL },
  { code: 'ceratoconjuntivite-seca', name: 'Ceratoconjuntivite seca', species: SMALL },
  { code: 'catarata', name: 'Catarata', species: SMALL },
  { code: 'cistite', name: 'Cistite', species: SMALL },
  { code: 'urolitiase', name: 'Urolitíase', species: SMALL },
  { code: 'dtuif', name: 'Doença do trato urinário inferior felino (DTUIF)', species: ['cat'] },
  { code: 'obstrucao-uretral', name: 'Obstrução uretral', species: SMALL },
  { code: 'drc', name: 'Doença renal crônica', species: SMALL },
  { code: 'ira', name: 'Injúria renal aguda', species: SMALL },
  { code: 'diabetes', name: 'Diabetes mellitus', species: SMALL },
  { code: 'hipotireoidismo', name: 'Hipotireoidismo', species: ['dog'] },
  { code: 'hiperadrenocorticismo', name: 'Hiperadrenocorticismo', species: ['dog'] },
  { code: 'hipertireoidismo', name: 'Hipertireoidismo felino', species: ['cat'] },
  { code: 'cmh', name: 'Cardiomiopatia hipertrófica', species: ['cat'] },
  { code: 'dvmm', name: 'Doença valvar mitral degenerativa', species: ['dog'] },
  { code: 'icc', name: 'Insuficiência cardíaca congestiva', species: SMALL },
  { code: 'traqueobronquite', name: 'Traqueobronquite infecciosa (tosse dos canis)', species: ['dog'] },
  { code: 'colapso-traqueia', name: 'Colapso de traqueia', species: ['dog'] },
  { code: 'complexo-respiratorio-felino', name: 'Complexo respiratório felino', species: ['cat'] },
  { code: 'asma-felina', name: 'Asma felina', species: ['cat'] },
  { code: 'displasia-coxofemoral', name: 'Displasia coxofemoral', species: ['dog'] },
  { code: 'rlcc', name: 'Ruptura de ligamento cruzado cranial', species: ['dog'] },
  { code: 'luxacao-patela', name: 'Luxação de patela', species: SMALL },
  { code: 'ddiv', name: 'Doença do disco intervertebral', species: SMALL },
  { code: 'osteoartrite', name: 'Osteoartrite', species: SMALL },
  { code: 'epilepsia', name: 'Epilepsia idiopática', species: SMALL },
  { code: 'piometra', name: 'Piometra', species: SMALL },
  { code: 'pseudociese', name: 'Pseudociese', species: ['dog'] },
  { code: 'neoplasia-mamaria', name: 'Neoplasia mamária', species: SMALL },
  { code: 'mastocitoma', name: 'Mastocitoma', species: ['dog'] },
  { code: 'linfoma', name: 'Linfoma', species: SMALL },
  { code: 'lipoma', name: 'Lipoma', species: ['dog'] },
  { code: 'erliquiose', name: 'Erliquiose', species: ['dog'] },
  { code: 'babesiose-canina', name: 'Babesiose canina', species: ['dog'] },
  { code: 'leishmaniose', name: 'Leishmaniose visceral', species: SMALL },
  { code: 'fiv', name: 'Imunodeficiência viral felina (FIV)', species: ['cat'] },
  { code: 'felv', name: 'Leucemia viral felina (FeLV)', species: ['cat'] },
  { code: 'pif', name: 'Peritonite infecciosa felina (PIF)', species: ['cat'] },
  { code: 'esporotricose', name: 'Esporotricose', species: SMALL },
  { code: 'megacolon', name: 'Constipação / megacólon', species: ['cat'] },
  { code: 'sacos-anais', name: 'Impactação ou saculite dos sacos anais', species: SMALL },
  { code: 'hernia-umbilical', name: 'Hérnia umbilical', species: SMALL },
  { code: 'criptorquidismo', name: 'Criptorquidismo', species: SMALL },
  { code: 'hpb', name: 'Hiperplasia prostática benigna', species: ['dog'] },
  // exóticos
  { code: 'maloclusao', name: 'Má oclusão dentária', species: ['rabbit', 'rodent'] },
  { code: 'estase-gi', name: 'Estase gastrointestinal', species: ['rabbit', 'rodent'] },
  { code: 'pododermatite', name: 'Pododermatite', species: ['rabbit', 'rodent', 'bird'] },
  { code: 'doenca-metabolica-ossea', name: 'Doença metabólica óssea', species: ['reptile', 'bird'] },
  { code: 'hipovitaminose-a', name: 'Hipovitaminose A', species: ['reptile', 'bird'] },
  { code: 'disecdise', name: 'Disecdise (muda incompleta)', species: ['reptile'] },
  { code: 'retencao-ovo', name: 'Retenção de ovo', species: ['bird', 'reptile'] },
  { code: 'clamidiose', name: 'Clamidiose aviária (psitacose)', species: ['bird'] },
  { code: 'picacismo', name: 'Arrancamento de penas (picacismo)', species: ['bird'] },
  // equinos
  { code: 'colica', name: 'Síndrome cólica', species: EQUINE },
  { code: 'laminite', name: 'Laminite', species: EQUINE },
  { code: 'garrotilho', name: 'Adenite equina (garrotilho)', species: EQUINE },
  { code: 'aie', name: 'Anemia infecciosa equina (notificação obrigatória)', species: EQUINE },
  { code: 'influenza-equina', name: 'Influenza equina', species: EQUINE },
  { code: 'habronemose', name: 'Habronemose', species: EQUINE },
  { code: 'pitiose', name: 'Pitiose', species: EQUINE },
  { code: 'tendinite', name: 'Tendinite', species: EQUINE },
  { code: 'abscesso-casco', name: 'Abscesso de casco', species: EQUINE },
  { code: 'rabdomiolise', name: 'Rabdomiólise de esforço', species: EQUINE },
  { code: 'ulcera-gastrica-equina', name: 'Síndrome de úlcera gástrica equina', species: EQUINE },
  // ruminantes e suínos
  { code: 'mastite-clinica', name: 'Mastite clínica', species: RUMINANT },
  { code: 'mastite-subclinica', name: 'Mastite subclínica', species: RUMINANT },
  { code: 'retencao-placenta', name: 'Retenção de placenta', species: RUMINANT },
  { code: 'hipocalcemia', name: 'Hipocalcemia puerperal (febre do leite)', species: RUMINANT },
  { code: 'cetose', name: 'Cetose', species: RUMINANT },
  { code: 'acidose-ruminal', name: 'Acidose ruminal', species: RUMINANT },
  { code: 'timpanismo', name: 'Timpanismo', species: RUMINANT },
  { code: 'crb', name: 'Complexo respiratório bovino', species: ['cattle'] },
  { code: 'tpb', name: 'Tristeza parasitária bovina', species: ['cattle'] },
  { code: 'doenca-digital', name: 'Doença digital / pododermatite', species: RUMINANT },
  { code: 'diarreia-neonatal', name: 'Diarreia neonatal', species: [...RUMINANT, 'swine'] },
  { code: 'brucelose', name: 'Brucelose (notificação obrigatória)', species: ['cattle', 'swine'] },
  { code: 'tuberculose', name: 'Tuberculose (notificação obrigatória)', species: ['cattle'] },
  { code: 'clostridiose', name: 'Clostridiose', species: RUMINANT },
  { code: 'linfadenite-caseosa', name: 'Linfadenite caseosa', species: SMALL_RUMINANT },
  { code: 'haemoncose', name: 'Haemoncose', species: SMALL_RUMINANT },
  { code: 'ectima', name: 'Ectima contagioso', species: SMALL_RUMINANT },
  { code: 'pneumonia-enzootica', name: 'Pneumonia enzoótica suína', species: ['swine'] },
  { code: 'circovirose', name: 'Circovirose suína', species: ['swine'] },
];
