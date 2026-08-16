/**
 * Catálogo global de exames. Os analitos definem os campos do formulário de
 * resultado; faixas de referência ficam em `registry.reference_ranges`, por
 * espécie, porque hemograma de gato não é hemograma de cão.
 */
export interface ExamSeed {
  code: string;
  name: string;
  category:
    | 'hematology'
    | 'biochemistry'
    | 'imaging'
    | 'cytology'
    | 'microbiology'
    | 'urinalysis'
    | 'parasitology'
    | 'other';
  specimenKind: string | null;
  turnaroundHours: number | null;
  analytes: Array<{ code: string; name: string; uom: string | null }>;
}

export const EXAM_CATALOG: ExamSeed[] = [
  {
    code: 'CBC',
    name: 'Hemograma completo',
    category: 'hematology',
    specimenKind: 'Sangue com EDTA',
    turnaroundHours: 4,
    analytes: [
      { code: 'RBC', name: 'Hemácias', uom: 'milhões/uL' },
      { code: 'HGB', name: 'Hemoglobina', uom: 'g/dL' },
      { code: 'HCT', name: 'Hematócrito', uom: '%' },
      { code: 'MCV', name: 'VCM', uom: 'fL' },
      { code: 'MCHC', name: 'CHCM', uom: 'g/dL' },
      { code: 'WBC', name: 'Leucócitos totais', uom: '/uL' },
      { code: 'NEUT', name: 'Neutrófilos segmentados', uom: '/uL' },
      { code: 'BAND', name: 'Bastonetes', uom: '/uL' },
      { code: 'LYMPH', name: 'Linfócitos', uom: '/uL' },
      { code: 'MONO', name: 'Monócitos', uom: '/uL' },
      { code: 'EOS', name: 'Eosinófilos', uom: '/uL' },
      { code: 'BASO', name: 'Basófilos', uom: '/uL' },
      { code: 'PLT', name: 'Plaquetas', uom: '/uL' },
      { code: 'TPP', name: 'Proteína plasmática total', uom: 'g/dL' },
    ],
  },
  {
    code: 'BIOQ_RENAL',
    name: 'Perfil renal (ureia e creatinina)',
    category: 'biochemistry',
    specimenKind: 'Soro',
    turnaroundHours: 4,
    analytes: [
      { code: 'UREA', name: 'Ureia', uom: 'mg/dL' },
      { code: 'CREA', name: 'Creatinina', uom: 'mg/dL' },
      { code: 'SDMA', name: 'SDMA', uom: 'ug/dL' },
    ],
  },
  {
    code: 'BIOQ_HEP',
    name: 'Perfil hepático',
    category: 'biochemistry',
    specimenKind: 'Soro',
    turnaroundHours: 4,
    analytes: [
      { code: 'ALT', name: 'ALT (TGP)', uom: 'U/L' },
      { code: 'AST', name: 'AST (TGO)', uom: 'U/L' },
      { code: 'FA', name: 'Fosfatase alcalina', uom: 'U/L' },
      { code: 'GGT', name: 'GGT', uom: 'U/L' },
      { code: 'BILT', name: 'Bilirrubina total', uom: 'mg/dL' },
      { code: 'ALB', name: 'Albumina', uom: 'g/dL' },
    ],
  },
  {
    code: 'GLIC',
    name: 'Glicemia',
    category: 'biochemistry',
    specimenKind: 'Soro ou sangue total',
    turnaroundHours: 1,
    analytes: [{ code: 'GLU', name: 'Glicose', uom: 'mg/dL' }],
  },
  {
    code: 'FRUCTO',
    name: 'Frutosamina',
    category: 'biochemistry',
    specimenKind: 'Soro',
    turnaroundHours: 48,
    analytes: [{ code: 'FRU', name: 'Frutosamina', uom: 'umol/L' }],
  },
  {
    code: 'T4',
    name: 'T4 total',
    category: 'biochemistry',
    specimenKind: 'Soro',
    turnaroundHours: 48,
    analytes: [{ code: 'T4T', name: 'T4 total', uom: 'ug/dL' }],
  },
  {
    code: 'URINA',
    name: 'Urinálise (EAS)',
    category: 'urinalysis',
    specimenKind: 'Urina',
    turnaroundHours: 4,
    analytes: [
      { code: 'DENS', name: 'Densidade', uom: null },
      { code: 'PH_U', name: 'pH', uom: null },
      { code: 'PROT_U', name: 'Proteína', uom: null },
      { code: 'GLU_U', name: 'Glicose', uom: null },
      { code: 'CET', name: 'Cetonas', uom: null },
      { code: 'SED', name: 'Sedimento', uom: null },
    ],
  },
  {
    code: 'UPC',
    name: 'Relação proteína/creatinina urinária',
    category: 'urinalysis',
    specimenKind: 'Urina',
    turnaroundHours: 24,
    analytes: [{ code: 'UPC', name: 'UPC', uom: null }],
  },
  {
    code: 'COPRO',
    name: 'Exame parasitológico de fezes',
    category: 'parasitology',
    specimenKind: 'Fezes',
    turnaroundHours: 24,
    analytes: [
      { code: 'OPG', name: 'Ovos por grama', uom: 'OPG' },
      { code: 'PARAS', name: 'Parasitas identificados', uom: null },
    ],
  },
  {
    code: 'HEMOPARAS',
    name: 'Pesquisa de hemoparasitas',
    category: 'parasitology',
    specimenKind: 'Sangue com EDTA',
    turnaroundHours: 4,
    analytes: [{ code: 'HEMOP', name: 'Resultado', uom: null }],
  },
  {
    code: 'CULT_ANTIB',
    name: 'Cultura com antibiograma',
    category: 'microbiology',
    specimenKind: 'Swab ou fragmento',
    turnaroundHours: 96,
    analytes: [
      { code: 'AGENTE', name: 'Agente isolado', uom: null },
      { code: 'ANTIB', name: 'Sensibilidade', uom: null },
    ],
  },
  {
    code: 'CITO',
    name: 'Citologia',
    category: 'cytology',
    specimenKind: 'Lâmina ou aspirado',
    turnaroundHours: 72,
    analytes: [{ code: 'LAUDO', name: 'Conclusão', uom: null }],
  },
  {
    code: 'HISTO',
    name: 'Histopatológico',
    category: 'cytology',
    specimenKind: 'Fragmento em formol',
    turnaroundHours: 168,
    analytes: [{ code: 'LAUDO', name: 'Conclusão', uom: null }],
  },
  {
    code: 'RX',
    name: 'Radiografia',
    category: 'imaging',
    specimenKind: null,
    turnaroundHours: 2,
    analytes: [{ code: 'LAUDO', name: 'Laudo radiográfico', uom: null }],
  },
  {
    code: 'USG_ABD',
    name: 'Ultrassonografia abdominal',
    category: 'imaging',
    specimenKind: null,
    turnaroundHours: 2,
    analytes: [{ code: 'LAUDO', name: 'Laudo ultrassonográfico', uom: null }],
  },
  {
    code: 'ECO',
    name: 'Ecocardiograma',
    category: 'imaging',
    specimenKind: null,
    turnaroundHours: 24,
    analytes: [
      { code: 'AE_AO', name: 'Relação AE/Ao', uom: null },
      { code: 'FE', name: 'Fração de encurtamento', uom: '%' },
      { code: 'LAUDO', name: 'Conclusão', uom: null },
    ],
  },
  {
    code: 'ECG',
    name: 'Eletrocardiograma',
    category: 'other',
    specimenKind: null,
    turnaroundHours: 2,
    analytes: [
      { code: 'FC', name: 'Frequência cardíaca', uom: 'bpm' },
      { code: 'RITMO', name: 'Ritmo', uom: null },
      { code: 'LAUDO', name: 'Conclusão', uom: null },
    ],
  },
  {
    code: 'SNAP_4DX',
    name: 'Teste rápido para hemoparasitoses',
    category: 'other',
    specimenKind: 'Sangue',
    turnaroundHours: 1,
    analytes: [
      { code: 'DIRO', name: 'Dirofilaria immitis', uom: null },
      { code: 'EHRL', name: 'Ehrlichia', uom: null },
      { code: 'ANAP', name: 'Anaplasma', uom: null },
      { code: 'BORR', name: 'Borrelia', uom: null },
    ],
  },
  {
    code: 'FIV_FELV',
    name: 'Teste rápido FIV e FeLV',
    category: 'other',
    specimenKind: 'Sangue',
    turnaroundHours: 1,
    analytes: [
      { code: 'FIV', name: 'FIV (anticorpo)', uom: null },
      { code: 'FELV', name: 'FeLV (antígeno)', uom: null },
    ],
  },
  {
    code: 'BRUCELOSE',
    name: 'Brucelose (AAT)',
    category: 'microbiology',
    specimenKind: 'Soro',
    turnaroundHours: 48,
    analytes: [{ code: 'AAT', name: 'Antígeno acidificado tamponado', uom: null }],
  },
  {
    code: 'CMT',
    name: 'California Mastitis Test',
    category: 'other',
    specimenKind: 'Leite',
    turnaroundHours: 1,
    analytes: [{ code: 'CMT', name: 'Escore por quarto mamário', uom: null }],
  },
];

/**
 * Faixas de referência iniciais, marcadas como `unvalidated`: o sistema
 * mostra como referência informativa e a clínica valida (ou substitui pela
 * faixa do próprio laboratório) antes de tratar como parâmetro clínico.
 */
export interface ReferenceRangeSeed {
  speciesCode: string;
  parameterCode: string;
  min: number | null;
  max: number | null;
  uom: string;
  source: string;
}

export const REFERENCE_RANGES: ReferenceRangeSeed[] = [
  { speciesCode: 'dog', parameterCode: 'temperature', min: 37.5, max: 39.2, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'dog', parameterCode: 'heart_rate', min: 60, max: 140, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'dog', parameterCode: 'respiratory_rate', min: 10, max: 30, uom: 'rpm', source: 'Literatura geral' },
  { speciesCode: 'dog', parameterCode: 'systolic_bp', min: 110, max: 160, uom: 'mmHg', source: 'Literatura geral' },
  { speciesCode: 'dog', parameterCode: 'blood_glucose', min: 70, max: 120, uom: 'mg/dL', source: 'Literatura geral' },
  { speciesCode: 'cat', parameterCode: 'temperature', min: 37.8, max: 39.5, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'cat', parameterCode: 'heart_rate', min: 140, max: 220, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'cat', parameterCode: 'respiratory_rate', min: 20, max: 40, uom: 'rpm', source: 'Literatura geral' },
  { speciesCode: 'cat', parameterCode: 'systolic_bp', min: 120, max: 160, uom: 'mmHg', source: 'Literatura geral' },
  { speciesCode: 'cat', parameterCode: 'blood_glucose', min: 70, max: 150, uom: 'mg/dL', source: 'Literatura geral' },
  { speciesCode: 'rabbit', parameterCode: 'temperature', min: 38.5, max: 40.0, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'rabbit', parameterCode: 'heart_rate', min: 180, max: 300, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'bird', parameterCode: 'temperature', min: 40.0, max: 42.0, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'bird', parameterCode: 'heart_rate', min: 150, max: 350, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'horse', parameterCode: 'temperature', min: 37.2, max: 38.5, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'horse', parameterCode: 'heart_rate', min: 28, max: 44, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'horse', parameterCode: 'respiratory_rate', min: 8, max: 16, uom: 'rpm', source: 'Literatura geral' },
  { speciesCode: 'cattle', parameterCode: 'temperature', min: 38.0, max: 39.3, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'cattle', parameterCode: 'heart_rate', min: 48, max: 84, uom: 'bpm', source: 'Literatura geral' },
  { speciesCode: 'cattle', parameterCode: 'respiratory_rate', min: 12, max: 36, uom: 'rpm', source: 'Literatura geral' },
  { speciesCode: 'sheep', parameterCode: 'temperature', min: 38.5, max: 40.0, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'goat', parameterCode: 'temperature', min: 38.5, max: 40.0, uom: 'C', source: 'Literatura geral' },
  { speciesCode: 'swine', parameterCode: 'temperature', min: 38.0, max: 40.0, uom: 'C', source: 'Literatura geral' },
];
