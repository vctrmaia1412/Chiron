import { Client } from 'pg';
import { hash as argonHash } from '@node-rs/argon2';
import { env } from '../config/env';
import { CryptoService } from '../common/crypto.service';
import { uuidv7 } from '../common/uuid';
import { provisionTenant } from '../modules/tenant/provisioning.service';

/**
 * Seed de demonstração. Cria dados claramente identificados como demo
 * (slug `demo` e `beta`, e-mails `@chiron.dev`) e nunca roda em produção.
 *
 * Existem dois tenants de propósito: o segundo serve para conferir na prática
 * que um usuário do tenant A não enxerga nada do tenant B.
 */

const DEMO_PASSWORD = 'Chiron@2026';

interface SeedUser {
  key: string;
  email: string;
  name: string;
  roleKeys: string[];
  isOwner?: boolean;
  professional?: {
    council: string;
    councilNumber: string;
    councilState: string;
    specialties: string[];
    color: string;
  };
}

const DEMO_USERS: SeedUser[] = [
  { key: 'owner', email: 'admin@chiron.dev', name: 'Helena Braga', roleKeys: ['owner'], isOwner: true },
  {
    key: 'vet1',
    email: 'vet@chiron.dev',
    name: 'Dr. Rafael Nogueira',
    roleKeys: ['veterinarian'],
    professional: {
      council: 'CRMV',
      councilNumber: 'SP-24518',
      councilState: 'SP',
      specialties: ['Clínica médica de pequenos animais', 'Cardiologia'],
      color: '#0F766E',
    },
  },
  {
    key: 'vet2',
    email: 'vet2@chiron.dev',
    name: 'Dra. Mariana Prado',
    roleKeys: ['veterinarian'],
    professional: {
      council: 'CRMV',
      councilNumber: 'SP-31902',
      councilState: 'SP',
      specialties: ['Animais silvestres e exóticos', 'Medicina de aves'],
      color: '#7C3AED',
    },
  },
  {
    key: 'vet3',
    email: 'vet3@chiron.dev',
    name: 'Dr. Caio Ferrari',
    roleKeys: ['veterinarian'],
    professional: {
      council: 'CRMV',
      councilNumber: 'SP-19770',
      councilState: 'SP',
      specialties: ['Grandes animais', 'Buiatria'],
      color: '#B45309',
    },
  },
  { key: 'tech', email: 'tecnico@chiron.dev', name: 'Bruno Salles', roleKeys: ['technician'] },
  { key: 'recep', email: 'recepcao@chiron.dev', name: 'Aline Duarte', roleKeys: ['receptionist'] },
  { key: 'finance', email: 'financeiro@chiron.dev', name: 'Tatiana Lopes', roleKeys: ['finance'] },
];

const SERVICES = [
  { key: 'consulta', name: 'Consulta clínica', category: 'consultation', minutes: 30, price: 180 },
  { key: 'retorno', name: 'Retorno', category: 'return', minutes: 20, price: 0 },
  { key: 'vacinacao', name: 'Vacinação', category: 'vaccination', minutes: 15, price: 95 },
  { key: 'consulta-exotico', name: 'Consulta de silvestres e exóticos', category: 'consultation', minutes: 40, price: 260 },
  { key: 'atendimento-campo', name: 'Atendimento a campo', category: 'consultation', minutes: 90, price: 420 },
  { key: 'emergencia', name: 'Atendimento de urgência', category: 'consultation', minutes: 45, price: 320 },
  { key: 'exame-imagem', name: 'Exame de imagem', category: 'exam', minutes: 30, price: 210 },
  { key: 'coleta-exames', name: 'Coleta de exames', category: 'exam', minutes: 15, price: 60 },
  { key: 'procedimento', name: 'Procedimento ambulatorial', category: 'procedure', minutes: 45, price: 350 },
  { key: 'cirurgia', name: 'Cirurgia', category: 'surgery', minutes: 120, price: 1500 },
  { key: 'banho-tosa', name: 'Banho e tosa', category: 'grooming', minutes: 60, price: 110 },
  { key: 'teleorientacao', name: 'Teleorientação', category: 'telehealth', minutes: 25, price: 120 },
];

const GENERIC_REASONS = [
  'Avaliação clínica de rotina',
  'Acompanhamento de quadro anterior',
  'Tutor relata mudança de comportamento',
];

const REASONS: Record<string, string[]> = {
  consulta: [
    'Apatia e redução do apetite',
    'Vômito intermitente há dois dias',
    'Prurido e lambedura excessiva das patas',
    'Claudicação leve após passeio',
    'Diarreia sem sangue há três dias',
    'Tosse seca noturna',
    'Emagrecimento progressivo',
    'Aumento da ingestão de água',
  ],
  retorno: [
    'Retorno para reavaliação clínica',
    'Reavaliação após término do tratamento',
    'Controle de peso e escore corporal',
    'Revisão de ferida cirúrgica',
  ],
  vacinacao: ['Reforço anual de vacina', 'Segunda dose do protocolo', 'Vacinação antirrábica'],
  'consulta-exotico': [
    'Penas opacas e menor vocalização',
    'Redução do consumo de feno',
    'Dificuldade de ecdise',
    'Perda de peso em animal exótico',
    'Apatia e postura encolhida',
  ],
  'atendimento-campo': [
    'Queda na produção de leite',
    'Claudicação de membro posterior',
    'Avaliação reprodutiva do rebanho',
    'Cólica leve com boa resposta ao manejo',
    'Escore corporal em queda',
  ],
  emergencia: [
    'Suspeita de intoxicação',
    'Dispneia aguda',
    'Trauma leve por atropelamento',
    'Crise convulsiva isolada',
  ],
  'coleta-exames': ['Coleta para perfil bioquímico', 'Hemograma de controle', 'Coleta para urinálise'],
  'exame-imagem': ['Radiografia de controle', 'Ultrassonografia abdominal', 'Radiografia de tórax'],
  procedimento: ['Limpeza e curativo de ferida', 'Drenagem de abscesso', 'Aplicação de medicação injetável'],
  teleorientacao: ['Orientação sobre manejo alimentar', 'Dúvida sobre medicação em uso', 'Triagem à distância'],
  'banho-tosa': ['Banho e tosa higiênica', 'Tosa de verão'],
};

interface SeedGuardian {
  key: string;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  city: string;
}

const GUARDIANS: SeedGuardian[] = [
  { key: 'g1', name: 'Marina Costa', cpf: '39053344705', email: 'marina.costa@exemplo.dev', phone: '(11) 98812-4471', city: 'São Paulo' },
  { key: 'g2', name: 'Paulo Henrique Souza', cpf: '52998224725', email: 'paulo.souza@exemplo.dev', phone: '(11) 99120-8834', city: 'São Paulo' },
  { key: 'g3', name: 'Juliana Alves', cpf: '11144477735', email: 'juliana.alves@exemplo.dev', phone: '(11) 97431-2290', city: 'Guarulhos' },
  { key: 'g4', name: 'Ricardo Menezes', cpf: '15350946056', email: 'ricardo.menezes@exemplo.dev', phone: '(11) 96622-7719', city: 'Osasco' },
  { key: 'g5', name: 'Fernanda Ribeiro', cpf: '28625587887', email: 'fernanda.ribeiro@exemplo.dev', phone: '(19) 98844-1102', city: 'Campinas' },
  { key: 'g6', name: 'Sítio Boa Esperança', cpf: '19131243000197', email: 'contato@boaesperanca.exemplo.dev', phone: '(19) 3555-2210', city: 'Itu' },
  { key: 'g7', name: 'Camila Tavares', cpf: '76470265212', email: 'camila.tavares@exemplo.dev', phone: '(11) 98123-6650', city: 'São Paulo' },
];

interface SeedPatient {
  key: string;
  name: string;
  speciesCode: string;
  breedName?: string;
  scientificName?: string;
  sex: 'male' | 'female' | 'unknown';
  reproductive: 'intact' | 'neutered' | 'spayed' | 'unknown';
  birthDate?: string;
  estimatedAgeMonths?: number;
  weightKg: number;
  color: string;
  guardianKey: string;
  microchip?: string;
  identifiers?: Array<{ scheme: string; value: string; issuer?: string }>;
  allergies?: Array<{ substance: string; normalized: string; reaction: string; severity: 'mild' | 'moderate' | 'severe' }>;
  alerts?: Array<{ kind: string; message: string }>;
  attributes?: Record<string, unknown>;
  notes?: string;
}

const PATIENTS: SeedPatient[] = [
  {
    key: 'p1',
    name: 'Thor',
    speciesCode: 'dog',
    breedName: 'Labrador Retriever',
    sex: 'male',
    reproductive: 'neutered',
    birthDate: '2019-03-14',
    weightKg: 32.4,
    color: 'Amarelo',
    guardianKey: 'g1',
    microchip: '981098104523771',
    allergies: [
      { substance: 'Dipirona', normalized: 'dipirona', reaction: 'Urticária e prurido intenso', severity: 'moderate' },
    ],
    notes: 'Ansioso na sala de espera. Prefere atendimento no consultório 2.',
  },
  {
    key: 'p2',
    name: 'Mel',
    speciesCode: 'cat',
    breedName: 'Sem raça definida',
    sex: 'female',
    reproductive: 'spayed',
    birthDate: '2021-08-02',
    weightKg: 4.1,
    color: 'Tricolor',
    guardianKey: 'g1',
    microchip: '981098104523772',
    alerts: [{ kind: 'aggressive', message: 'Reage a contenção. Usar toalha e luva.' }],
  },
  {
    key: 'p3',
    name: 'Bidu',
    speciesCode: 'dog',
    breedName: 'Sem raça definida',
    sex: 'male',
    reproductive: 'intact',
    estimatedAgeMonths: 96,
    weightKg: 12.8,
    color: 'Caramelo',
    guardianKey: 'g2',
  },
  {
    key: 'p4',
    name: 'Nina',
    speciesCode: 'cat',
    breedName: 'Siamês',
    sex: 'female',
    reproductive: 'spayed',
    birthDate: '2017-11-20',
    weightKg: 3.6,
    color: 'Seal point',
    guardianKey: 'g3',
    allergies: [
      { substance: 'Amoxicilina', normalized: 'amoxicilina', reaction: 'Vômito e diarreia', severity: 'moderate' },
    ],
    notes: 'Doença renal crônica estágio 2 em acompanhamento.',
  },
  {
    key: 'p5',
    name: 'Kiwi',
    speciesCode: 'bird',
    breedName: 'Calopsita',
    scientificName: 'Nymphicus hollandicus',
    sex: 'male',
    reproductive: 'intact',
    estimatedAgeMonths: 30,
    weightKg: 0.092,
    color: 'Lutino',
    guardianKey: 'g4',
    identifiers: [{ scheme: 'leg_band', value: 'SP-2023-11482', issuer: 'Criadouro registrado' }],
    attributes: { ringNumber: 'SP-2023-11482' },
  },
  {
    key: 'p6',
    name: 'Tobias',
    speciesCode: 'reptile',
    breedName: 'Jabuti piranga',
    scientificName: 'Chelonoidis carbonarius',
    sex: 'unknown',
    reproductive: 'unknown',
    estimatedAgeMonths: 144,
    weightKg: 3.85,
    color: 'Casco escuro com manchas alaranjadas',
    guardianKey: 'g4',
    identifiers: [{ scheme: 'registry', value: 'IBAMA-4471902', issuer: 'IBAMA' }],
    attributes: { terrariumTempC: 30, humidityPercent: 70, uvbSource: 'Lâmpada UVB 10.0' },
  },
  {
    key: 'p7',
    name: 'Estrela',
    speciesCode: 'horse',
    breedName: 'Mangalarga Marchador',
    sex: 'female',
    reproductive: 'intact',
    birthDate: '2016-09-08',
    weightKg: 432,
    color: 'Baia',
    guardianKey: 'g5',
    identifiers: [{ scheme: 'passport', value: 'ABCCMM-778213', issuer: 'ABCCMM' }],
    attributes: { heightCm: 152, coat: 'Baia', passport: 'ABCCMM-778213' },
  },
  {
    key: 'p8',
    name: 'Vaca 148',
    speciesCode: 'cattle',
    breedName: 'Girolando',
    sex: 'female',
    reproductive: 'intact',
    estimatedAgeMonths: 60,
    weightKg: 512,
    color: 'Malhada preta e branca',
    guardianKey: 'g6',
    identifiers: [
      { scheme: 'ear_tag', value: '148', issuer: 'Sítio Boa Esperança' },
      { scheme: 'sisbov', value: '105000000148223', issuer: 'SISBOV' },
    ],
    attributes: { lot: 'Lote 3 - lactação', productionStage: 'Lactação', milkLitersDay: 21 },
  },
  {
    key: 'p9',
    name: 'Pipoca',
    speciesCode: 'rabbit',
    breedName: 'Mini Lop',
    sex: 'female',
    reproductive: 'intact',
    estimatedAgeMonths: 18,
    weightKg: 1.72,
    color: 'Branco e cinza',
    guardianKey: 'g7',
  },
  {
    key: 'p10',
    name: 'Bolinha',
    speciesCode: 'rodent',
    breedName: 'Porquinho-da-índia',
    scientificName: 'Cavia porcellus',
    sex: 'male',
    reproductive: 'intact',
    estimatedAgeMonths: 14,
    weightKg: 0.86,
    color: 'Rajado',
    guardianKey: 'g7',
    alerts: [{ kind: 'special_diet', message: 'Suplementação de vitamina C diária.' }],
  },
  {
    key: 'p11',
    name: 'Simba',
    speciesCode: 'dog',
    breedName: 'Golden Retriever',
    sex: 'male',
    reproductive: 'intact',
    birthDate: '2023-05-30',
    weightKg: 27.9,
    color: 'Dourado',
    guardianKey: 'g2',
    microchip: '981098104523773',
  },
  {
    key: 'p12',
    name: 'Amora',
    speciesCode: 'cat',
    breedName: 'Persa',
    sex: 'female',
    reproductive: 'spayed',
    birthDate: '2020-01-17',
    weightKg: 4.9,
    color: 'Creme',
    guardianKey: 'g3',
  },
];

// ------------------------------------------------- base gerada para volume
// Os tutores e pacientes acima são os casos de demonstração, com histórico
// escrito à mão. A base abaixo é gerada com semente fixa e existe para que três
// meses de agenda não recaiam sempre nos mesmos doze animais.

const FIRST_NAMES = [
  'Ana', 'Carlos', 'Beatriz', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Priscila', 'Rafael',
  'Sabrina', 'Thiago', 'Vanessa', 'Wagner', 'Yasmin', 'Bruno', 'Carolina', 'Diego',
  'Elaine', 'Fábio', 'Giovana', 'Hugo', 'Joana', 'Leandro',
];

const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Carvalho', 'Almeida',
  'Ferreira', 'Rodrigues', 'Barbosa', 'Martins', 'Rocha', 'Dias', 'Moreira',
];

const CITIES = ['São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'Campinas', 'Itu', 'Barueri'];

const PET_NAMES = [
  'Luna', 'Bob', 'Fred', 'Maya', 'Zeus', 'Lola', 'Max', 'Cacau', 'Fiona', 'Théo',
  'Nick', 'Bela', 'Duque', 'Manu', 'Pretinha', 'Rex', 'Chico', 'Nuvem', 'Bento', 'Aurora',
  'Pandora', 'Toby', 'Frida', 'Cookie', 'Jade', 'Loki', 'Maggie', 'Nemo', 'Olívia', 'Pipa',
  'Quindim', 'Romeu', 'Safira', 'Tigrão', 'Uva', 'Vito', 'Xuxa', 'Zara', 'Amendoim', 'Brisa',
  'Canela', 'Dandara', 'Elvis', 'Fumaça', 'Gaia', 'Horus', 'Iris', 'Juno', 'Kiara', 'Lupi',
  'Malu', 'Nina Flor', 'Otto', 'Perola', 'Quiara', 'Rubi', 'Simba II', 'Trufa', 'Ursa', 'Valente',
];

const COLORS = ['Preto', 'Branco', 'Caramelo', 'Tigrado', 'Cinza', 'Malhado', 'Rajado', 'Dourado', 'Tricolor'];

const SPECIES_PROFILE: Record<string, { weight: [number, number]; maxAgeYears: number }> = {
  dog: { weight: [3, 45], maxAgeYears: 13 },
  cat: { weight: [2.5, 7.5], maxAgeYears: 15 },
  bird: { weight: [0.02, 1.2], maxAgeYears: 12 },
  reptile: { weight: [0.3, 8], maxAgeYears: 15 },
  rabbit: { weight: [1.2, 3.2], maxAgeYears: 9 },
  rodent: { weight: [0.3, 1.5], maxAgeYears: 5 },
  horse: { weight: [380, 600], maxAgeYears: 20 },
  cattle: { weight: [400, 700], maxAgeYears: 10 },
};

/** CPF com dígitos verificadores corretos, derivado de uma semente. */
function cpfFrom(rng: () => number): string {
  const digits: number[] = [];
  for (let index = 0; index < 9; index += 1) digits.push(Math.floor(rng() * 10));
  for (let round = 0; round < 2; round += 1) {
    const length = digits.length;
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += (digits[index] ?? 0) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join('');
}

const EXTRA_SPECIES: string[] = [
  ...Array<string>(26).fill('dog'),
  ...Array<string>(14).fill('cat'),
  ...Array<string>(4).fill('bird'),
  ...Array<string>(3).fill('rabbit'),
  ...Array<string>(3).fill('rodent'),
  ...Array<string>(2).fill('reptile'),
  ...Array<string>(4).fill('horse'),
  ...Array<string>(4).fill('cattle'),
];

const baseRng = makeRng(0x5eed1412);
const usedDocuments = new Set(GUARDIANS.map((g) => g.cpf));

for (let index = 0; index < 30; index += 1) {
  const first = pick(baseRng, FIRST_NAMES);
  const last = pick(baseRng, LAST_NAMES);
  let cpf = cpfFrom(baseRng);
  while (usedDocuments.has(cpf)) cpf = cpfFrom(baseRng);
  usedDocuments.add(cpf);

  const slug = `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  GUARDIANS.push({
    key: `gx${index + 1}`,
    name: `${first} ${last}`,
    cpf,
    email: `${slug}.${index + 1}@exemplo.dev`,
    phone: `(11) 9${String(1000 + Math.floor(baseRng() * 8999))}-${String(1000 + Math.floor(baseRng() * 8999))}`,
    city: pick(baseRng, CITIES),
  });
}

for (const [index, speciesCode] of EXTRA_SPECIES.entries()) {
  const profile = SPECIES_PROFILE[speciesCode] ?? SPECIES_PROFILE.dog;
  const weightRange = profile?.weight ?? [1, 10];
  const maxAgeYears = profile?.maxAgeYears ?? 10;
  const ageDays = Math.floor(180 + baseRng() * maxAgeYears * 365);
  const female = baseRng() < 0.5;

  PATIENTS.push({
    key: `px${index + 1}`,
    name: PET_NAMES[index] ?? `Paciente ${index + 1}`,
    speciesCode,
    sex: female ? 'female' : 'male',
    reproductive: baseRng() < 0.6 ? (female ? 'spayed' : 'neutered') : 'intact',
    birthDate: dateOnly(new Date(Date.now() - ageDays * 86_400_000)),
    weightKg: Number((weightRange[0] + baseRng() * (weightRange[1] - weightRange[0])).toFixed(2)),
    color: pick(baseRng, COLORS),
    guardianKey: `gx${1 + (index % 30)}`,
  });
}

function iso(date: Date): string {
  return date.toISOString();
}

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Gerador pseudoaleatório com semente fixa. O volume de demonstração precisa
 * ser variado mas idêntico a cada execução, para que um bug reproduza igual.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

function between(rng: () => number, min: number, max: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((min + rng() * (max - min)) * factor) / factor;
}

export interface SeedOptions {
  connectionString?: string;
  quiet?: boolean;
}

export interface SeedResult {
  tenantId: string;
  betaTenantId: string;
  password: string;
  users: Array<{ email: string; name: string; roles: string[] }>;
}

export async function seedDemoData(options: SeedOptions = {}): Promise<SeedResult> {
  const cfg = env();
  if (cfg.APP_ENV === 'prod' || cfg.NODE_ENV === 'production') {
    throw new Error('O seed de demonstração não pode rodar em produção.');
  }
  const log = options.quiet ? () => undefined : (message: string) => console.log(message);

  const url =
    options.connectionString ?? cfg.DATABASE_ADMIN_URL ?? cfg.DATABASE_MIGRATION_URL ?? cfg.DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  const crypto = new CryptoService();
  const passwordHash = await argonHash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  try {
    // A limpeza vem antes da transação porque roda em outra conexão, com o
    // papel dono das tabelas (ver purgeDemoTenants).
    const existing = await client.query<{ id: string }>(`SELECT id FROM platform.tenants WHERE slug IN ('demo','beta')`);
    if (existing.rowCount) {
      log('Removendo dados de demonstração anteriores...');
      await purgeDemoTenants(cfg.DATABASE_MIGRATION_URL ?? url);
    }

    await client.query('BEGIN');

    const speciesRows = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM registry.species WHERE tenant_id IS NULL`,
    );
    const speciesByCode = new Map(speciesRows.rows.map((r) => [r.code, r.id]));

    const breedRows = await client.query<{ id: string; name: string; species_id: string }>(
      `SELECT id, name, species_id FROM registry.breeds WHERE tenant_id IS NULL`,
    );
    const breedKey = (speciesId: string, name: string) => `${speciesId}::${name}`;
    const breedsByKey = new Map(breedRows.rows.map((r) => [breedKey(r.species_id, r.name), r.id]));

    // ------------------------------------------------------------ tenant
    // A organização, a unidade padrão, o proprietário e a membership dele saem
    // do mesmo provisionamento usado para colocar uma clínica no ar. Se o seed
    // repetisse a lógica, as duas divergiriam com o tempo.
    const ownerSeed = DEMO_USERS.find((u) => u.isOwner);
    if (!ownerSeed) throw new Error('Nenhum usuário de demonstração marcado como proprietário.');

    const demoAddress = {
      street: 'Rua das Acácias',
      number: '1420',
      district: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
      zip: '05432-000',
    };

    const demo = await provisionTenant(
      client,
      {
        slug: 'demo',
        name: 'Clínica Veterinária Aurora',
        planKey: 'hospital',
        status: 'active',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        settings: {
          prescriptionHeader: 'Rua das Acácias, 1420 - Pinheiros, São Paulo/SP - (11) 3555-8800 - CRMV-SP 12345',
          finishRequiresOwnEncounter: false,
          demo: true,
        },
        facility: {
          name: 'Unidade Pinheiros',
          code: 'PIN',
          address: demoAddress,
          phone: '(11) 3555-8800',
        },
        // Com a senha pronta o provisionamento não gera convite: o acesso de
        // demonstração precisa funcionar assim que o seed termina.
        owner: { email: ownerSeed.email, name: ownerSeed.name, passwordHash },
      },
      crypto,
    );
    const tenantId = demo.tenantId;
    const facilityMain = demo.facilityId;

    const legalEntityId = uuidv7();
    await client.query(
      `INSERT INTO platform.legal_entities
         (id, tenant_id, person_type, legal_name, trade_name, document_encrypted, document_hash,
          document_masked, tax_regime, address)
       VALUES ($1,$2,'company','Aurora Serviços Veterinários LTDA','Aurora Veterinária',$3,$4,$5,'simples_nacional',$6)`,
      [
        legalEntityId,
        tenantId,
        crypto.encrypt('19131243000197'),
        crypto.blindIndex('19131243000197'),
        crypto.mask('19131243000197'),
        JSON.stringify(demoAddress),
      ],
    );

    // A unidade padrão nasce no provisionamento, ainda sem pessoa jurídica: o
    // seed completa o vínculo e acrescenta a segunda unidade.
    await client.query(`UPDATE platform.facilities SET legal_entity_id = $1 WHERE tenant_id = $2 AND id = $3`, [
      legalEntityId,
      tenantId,
      facilityMain,
    ]);

    const facilityUnit = uuidv7();
    await client.query(
      `INSERT INTO platform.facilities (id, tenant_id, legal_entity_id, name, code, kind, address, phone, timezone, is_default)
       VALUES ($1,$2,$3,'Unidade Santana','SAN','clinic',$4,'(11) 3555-8811','America/Sao_Paulo',false)`,
      [
        facilityUnit,
        tenantId,
        legalEntityId,
        JSON.stringify({ street: 'Avenida Braz Leme', number: '980', district: 'Santana', city: 'São Paulo', state: 'SP', zip: '02511-000' }),
      ],
    );

    // ------------------------------------------------------------- papéis
    // Os papéis do sistema são globais (tenant_id nulo), sincronizados por
    // reference-data. Copiá-los por tenant faria a mesma chave aparecer duas
    // vezes na lista de papéis, já que a consulta soma global e do tenant.
    const roleRows = await client.query<{ id: string; key: string }>(
      `SELECT id, key FROM iam.roles WHERE tenant_id IS NULL`,
    );
    const roleIds = new Map(roleRows.rows.map((r) => [r.key, r.id]));
    const ownerRoleId = roleIds.get('owner');
    if (!ownerRoleId) {
      throw new Error('Papéis do sistema não encontrados. Rode a sincronização de dados de referência antes do seed.');
    }

    // ----------------------------------------------------- usuários e time
    const userIds = new Map<string, string>();
    userIds.set(ownerSeed.key, demo.ownerUserId);
    const professionalIds = new Map<string, string>();

    for (const seedUser of DEMO_USERS) {
      // O proprietário já veio do provisionamento, com conta e membership.
      if (seedUser.isOwner) continue;
      const userId = uuidv7();
      await client.query(
        `INSERT INTO iam.users (id, email, password_hash, name, status, is_platform_staff)
         VALUES ($1,$2,$3,$4,'active',false)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
         RETURNING id`,
        [userId, seedUser.email, passwordHash, seedUser.name],
      );
      const resolved = await client.query<{ id: string }>(`SELECT id FROM iam.users WHERE email = $1`, [seedUser.email]);
      const finalUserId = resolved.rows[0]?.id ?? userId;
      userIds.set(seedUser.key, finalUserId);

      let professionalId: string | null = null;
      if (seedUser.professional) {
        professionalId = uuidv7();
        await client.query(
          `INSERT INTO registry.professionals
             (id, tenant_id, user_id, name, council, council_number, council_state, specialties, color, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
          [
            professionalId,
            tenantId,
            finalUserId,
            seedUser.name,
            seedUser.professional.council,
            seedUser.professional.councilNumber,
            seedUser.professional.councilState,
            seedUser.professional.specialties,
            seedUser.professional.color,
          ],
        );
        professionalIds.set(seedUser.key, professionalId);
      }

      const membershipId = uuidv7();
      await client.query(
        `INSERT INTO iam.memberships
           (id, tenant_id, user_id, status, is_owner, professional_id, all_facilities, default_facility_id)
         VALUES ($1,$2,$3,'active',$4,$5,true,$6)`,
        [membershipId, tenantId, finalUserId, seedUser.isOwner ?? false, professionalId, facilityMain],
      );

      for (const roleKey of seedUser.roleKeys) {
        const roleId = roleIds.get(roleKey);
        if (!roleId) continue;
        await client.query(
          `INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id) VALUES ($1,$2,$3)`,
          [membershipId, roleId, tenantId],
        );
      }
    }

    // ------------------------------------------------------------ serviços
    const serviceIds = new Map<string, string>();
    for (const service of SERVICES) {
      const serviceId = uuidv7();
      await client.query(
        `INSERT INTO registry.service_catalog
           (id, tenant_id, key, name, category, default_duration_min, default_price, requires_professional, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)`,
        [serviceId, tenantId, service.key, service.name, service.category, service.minutes, service.price],
      );
      serviceIds.set(service.key, serviceId);
    }

    // --------------------------------------------------------- laboratório
    const labInternalId = uuidv7();
    const labExternalId = uuidv7();
    await client.query(
      `INSERT INTO lab.laboratories (id, tenant_id, name, is_internal, active)
       VALUES ($1,$2,'Laboratório interno Aurora',true,true),
              ($3,$2,'Laboratório Vetlab (externo)',false,true)`,
      [labInternalId, tenantId, labExternalId],
    );

    // ---------------------------------------------------------- agendas
    for (const vetKey of ['vet1', 'vet2', 'vet3']) {
      const professionalId = professionalIds.get(vetKey);
      if (!professionalId) continue;
      await client.query(
        `INSERT INTO scheduling.schedules (tenant_id, facility_id, professional_id, slot_minutes, working_hours, active)
         VALUES ($1,$2,$3,30,$4,true)`,
        [
          tenantId,
          facilityMain,
          professionalId,
          JSON.stringify([
            { weekday: 1, start: '08:00', end: '12:00' },
            { weekday: 1, start: '13:30', end: '18:00' },
            { weekday: 2, start: '08:00', end: '12:00' },
            { weekday: 2, start: '13:30', end: '18:00' },
            { weekday: 3, start: '08:00', end: '12:00' },
            { weekday: 3, start: '13:30', end: '18:00' },
            { weekday: 4, start: '08:00', end: '12:00' },
            { weekday: 4, start: '13:30', end: '18:00' },
            { weekday: 5, start: '08:00', end: '12:00' },
            { weekday: 5, start: '13:30', end: '17:00' },
            { weekday: 6, start: '08:00', end: '12:00' },
          ]),
        ],
      );
    }

    // ------------------------------------------------------------- tutores
    const guardianIds = new Map<string, string>();
    for (const guardian of GUARDIANS) {
      const guardianId = uuidv7();
      const isCompany = guardian.cpf.length === 14;
      const number = await nextNumber(client, tenantId, 'guardian');
      await client.query(
        `INSERT INTO registry.guardians
           (id, tenant_id, number, person_type, name, document_kind, document_encrypted, document_hash,
            document_masked, email, phone_primary, address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          guardianId,
          tenantId,
          number,
          isCompany ? 'company' : 'individual',
          guardian.name,
          isCompany ? 'cnpj' : 'cpf',
          crypto.encrypt(guardian.cpf),
          crypto.blindIndex(guardian.cpf),
          crypto.mask(guardian.cpf),
          guardian.email,
          guardian.phone,
          JSON.stringify({ city: guardian.city, state: 'SP' }),
        ],
      );
      guardianIds.set(guardian.key, guardianId);

      for (const channel of ['email', 'whatsapp']) {
        await client.query(
          `INSERT INTO documents.communication_preferences (tenant_id, guardian_id, channel, allowed, legal_basis)
           VALUES ($1,$2,$3,true,'execução de contrato')`,
          [tenantId, guardianId, channel],
        );
      }
    }

    // ----------------------------------------------------------- pacientes
    const patientIds = new Map<string, string>();
    for (const patient of PATIENTS) {
      const speciesId = speciesByCode.get(patient.speciesCode);
      if (!speciesId) throw new Error(`Espécie ${patient.speciesCode} não encontrada.`);
      const breedId = patient.breedName ? breedsByKey.get(breedKey(speciesId, patient.breedName)) ?? null : null;

      const patientId = uuidv7();
      const number = await nextNumber(client, tenantId, 'patient');
      const attributes = { ...(patient.attributes ?? {}) };
      if (patient.scientificName) attributes.scientificName = patient.scientificName;

      await client.query(
        `INSERT INTO registry.patients
           (id, tenant_id, number, name, species_id, breed_id, sex, reproductive_status, birth_date,
            birth_date_precision, estimated_age_months, color_markings, current_weight_kg, current_weight_at,
            status, attributes, notes, origin_facility_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), 'active', $14, $15, $16)`,
        [
          patientId,
          tenantId,
          number,
          patient.name,
          speciesId,
          breedId,
          patient.sex,
          patient.reproductive,
          patient.birthDate ?? null,
          patient.birthDate ? 'exact' : null,
          patient.estimatedAgeMonths ?? null,
          patient.color,
          patient.weightKg,
          JSON.stringify(attributes),
          patient.notes ?? null,
          facilityMain,
        ],
      );
      patientIds.set(patient.key, patientId);

      const guardianId = guardianIds.get(patient.guardianKey);
      if (guardianId) {
        await client.query(
          `INSERT INTO registry.patient_guardians (tenant_id, patient_id, guardian_id, role, is_primary)
           VALUES ($1,$2,$3,'owner',true)`,
          [tenantId, patientId, guardianId],
        );
      }

      if (patient.microchip) {
        await client.query(
          `INSERT INTO registry.patient_identifiers (tenant_id, patient_id, scheme, value, issuer)
           VALUES ($1,$2,'microchip',$3,'ISO 11784/11785')`,
          [tenantId, patientId, patient.microchip],
        );
      }
      for (const identifier of patient.identifiers ?? []) {
        await client.query(
          `INSERT INTO registry.patient_identifiers (tenant_id, patient_id, scheme, value, issuer)
           VALUES ($1,$2,$3,$4,$5)`,
          [tenantId, patientId, identifier.scheme, identifier.value, identifier.issuer ?? null],
        );
      }
      for (const allergy of patient.allergies ?? []) {
        await client.query(
          `INSERT INTO registry.patient_allergies
             (tenant_id, patient_id, substance, active_ingredient_normalized, reaction, severity, status)
           VALUES ($1,$2,$3,$4,$5,$6,'active')`,
          [tenantId, patientId, allergy.substance, allergy.normalized, allergy.reaction, allergy.severity],
        );
      }
      for (const alert of patient.alerts ?? []) {
        await client.query(
          `INSERT INTO registry.patient_alerts (tenant_id, patient_id, kind, message, active)
           VALUES ($1,$2,$3,$4,true)`,
          [tenantId, patientId, alert.kind, alert.message],
        );
      }

      // histórico de peso: dá curva de evolução no prontuário
      const weightCode = 'weight';
      for (let i = 3; i >= 0; i -= 1) {
        const measured = new Date();
        measured.setMonth(measured.getMonth() - i * 3);
        const drift = 1 + (i === 0 ? 0 : (Math.round(Math.sin(i * 7) * 40) / 1000));
        await client.query(
          `INSERT INTO clinical.observations
             (tenant_id, patient_id, code, value_numeric, uom, entered_value, entered_uom, measured_at, status)
           VALUES ($1,$2,$3,$4,'kg',$5,'kg',$6,'final')`,
          [
            tenantId,
            patientId,
            weightCode,
            Number((patient.weightKg * drift).toFixed(3)),
            String(Number((patient.weightKg * drift).toFixed(3))),
            iso(measured),
          ],
        );
      }
    }

    // ----------------------------------------------------------- exames
    const examCatalog = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM lab.exam_catalog WHERE tenant_id IS NULL`,
    );
    const examByCode = new Map(examCatalog.rows.map((r) => [r.code, r.id]));

    // ------------------------------------------------ agenda e atendimentos
    const today = new Date();
    const vet1 = professionalIds.get('vet1') ?? null;
    const vet2 = professionalIds.get('vet2') ?? null;
    const vet3 = professionalIds.get('vet3') ?? null;
    const userVet1 = userIds.get('vet1') ?? null;
    const userRecep = userIds.get('recep') ?? null;

    interface AgendaSeed {
      patientKey: string;
      serviceKey: string;
      professionalId: string | null;
      dayOffset: number;
      hour: number;
      minute: number;
      status: 'scheduled' | 'confirmed' | 'checked_in' | 'in_service' | 'completed' | 'no_show' | 'cancelled';
      encounter?: 'finished' | 'in_progress' | 'arrived' | 'triaged';
      reason?: string;
      /** Marca um item curado que outra parte do seed referencia pelo nome. */
      tag?: string;
      /** Item gerado em volume, com conteúdo clínico genérico. */
      bulk?: boolean;
    }

    const AGENDA: AgendaSeed[] = [
      { patientKey: 'p1', serviceKey: 'consulta', professionalId: vet1, dayOffset: -21, hour: 9, minute: 0, status: 'completed', encounter: 'finished', reason: 'Claudicação no membro posterior direito' },
      { patientKey: 'p4', serviceKey: 'consulta', professionalId: vet1, dayOffset: -14, hour: 10, minute: 30, status: 'completed', encounter: 'finished', reason: 'Reavaliação renal', tag: 'nina-renal' },
      { patientKey: 'p5', serviceKey: 'consulta-exotico', professionalId: vet2, dayOffset: -10, hour: 14, minute: 0, status: 'completed', encounter: 'finished', reason: 'Penas arrepiadas e apatia' },
      { patientKey: 'p8', serviceKey: 'atendimento-campo', professionalId: vet3, dayOffset: -7, hour: 8, minute: 0, status: 'completed', encounter: 'finished', reason: 'Queda na produção de leite' },
      { patientKey: 'p2', serviceKey: 'vacinacao', professionalId: vet1, dayOffset: -5, hour: 11, minute: 0, status: 'completed', encounter: 'finished', reason: 'Vacina quádrupla felina' },
      { patientKey: 'p7', serviceKey: 'atendimento-campo', professionalId: vet3, dayOffset: -3, hour: 9, minute: 0, status: 'completed', encounter: 'finished', reason: 'Cólica leve' },
      { patientKey: 'p1', serviceKey: 'retorno', professionalId: vet1, dayOffset: 0, hour: 8, minute: 30, status: 'completed', encounter: 'finished', reason: 'Retorno da claudicação' },
      { patientKey: 'p3', serviceKey: 'consulta', professionalId: vet1, dayOffset: 0, hour: 9, minute: 30, status: 'in_service', encounter: 'in_progress', reason: 'Otite recorrente', tag: 'bidu-otite' },
      { patientKey: 'p9', serviceKey: 'consulta-exotico', professionalId: vet2, dayOffset: 0, hour: 10, minute: 30, status: 'checked_in', encounter: 'triaged', reason: 'Diminuição do apetite' },
      { patientKey: 'p12', serviceKey: 'consulta', professionalId: vet1, dayOffset: 0, hour: 11, minute: 30, status: 'checked_in', encounter: 'arrived', reason: 'Tosse seca há 3 dias' },
      { patientKey: 'p11', serviceKey: 'vacinacao', professionalId: vet1, dayOffset: 0, hour: 14, minute: 0, status: 'confirmed' },
      { patientKey: 'p6', serviceKey: 'consulta-exotico', professionalId: vet2, dayOffset: 0, hour: 15, minute: 0, status: 'scheduled', reason: 'Avaliação de rotina' },
      { patientKey: 'p10', serviceKey: 'consulta-exotico', professionalId: vet2, dayOffset: 0, hour: 16, minute: 0, status: 'scheduled' },
      { patientKey: 'p2', serviceKey: 'banho-tosa', professionalId: null, dayOffset: 1, hour: 9, minute: 0, status: 'scheduled' },
      { patientKey: 'p4', serviceKey: 'coleta-exames', professionalId: vet1, dayOffset: 1, hour: 10, minute: 0, status: 'scheduled', reason: 'Controle de ureia e creatinina' },
      { patientKey: 'p7', serviceKey: 'atendimento-campo', professionalId: vet3, dayOffset: 2, hour: 8, minute: 0, status: 'scheduled' },
      { patientKey: 'p1', serviceKey: 'exame-imagem', professionalId: vet1, dayOffset: 3, hour: 11, minute: 0, status: 'scheduled', reason: 'Radiografia de controle' },
      { patientKey: 'p3', serviceKey: 'retorno', professionalId: vet1, dayOffset: 7, hour: 9, minute: 0, status: 'scheduled' },
      { patientKey: 'p12', serviceKey: 'consulta', professionalId: vet1, dayOffset: -2, hour: 15, minute: 0, status: 'no_show' },
      { patientKey: 'p11', serviceKey: 'consulta', professionalId: vet1, dayOffset: -1, hour: 16, minute: 0, status: 'cancelled' },
    ];

    // --------------------------------- volume: 3 meses atrás e 1 mês à frente
    // A agenda acima é curada e cobre os casos de demonstração do dia. O bloco
    // abaixo preenche o histórico e o futuro, para que agenda, prontuário,
    // faturamento e relatórios tenham volume suficiente para teste.
    const HISTORY_DAYS = 90;
    const FUTURE_DAYS = 30;

    const keysOf = (codes: string[]) => PATIENTS.filter((p) => codes.includes(p.speciesCode)).map((p) => p.key);

    const ROSTER: Array<{
      professionalId: string | null;
      patientKeys: string[];
      serviceKeys: string[];
      slotsPerDay: [number, number];
    }> = [
      {
        professionalId: vet1,
        patientKeys: keysOf(['dog', 'cat']),
        serviceKeys: [
          'consulta', 'consulta', 'consulta', 'retorno', 'retorno', 'vacinacao',
          'coleta-exames', 'exame-imagem', 'procedimento', 'emergencia', 'teleorientacao',
        ],
        slotsPerDay: [4, 7],
      },
      {
        professionalId: vet2,
        patientKeys: keysOf(['bird', 'reptile', 'rabbit', 'rodent']),
        serviceKeys: ['consulta-exotico', 'consulta-exotico', 'retorno', 'coleta-exames'],
        slotsPerDay: [1, 3],
      },
      {
        professionalId: vet3,
        patientKeys: keysOf(['horse', 'cattle']),
        serviceKeys: ['atendimento-campo', 'atendimento-campo', 'retorno', 'coleta-exames'],
        slotsPerDay: [1, 2],
      },
    ];

    // O mesmo profissional não pode ter horários sobrepostos (constraint
    // appointments_no_overlap), então cada faixa é reservada antes de virar item.
    const busySlots = new Map<string, Array<[number, number]>>();
    const reserveSlot = (professionalId: string | null, start: Date, minutes: number): boolean => {
      if (!professionalId) return true;
      const from = start.getTime();
      const to = from + minutes * 60_000;
      const ranges = busySlots.get(professionalId) ?? [];
      if (ranges.some(([a, b]) => from < b && to > a)) return false;
      ranges.push([from, to]);
      busySlots.set(professionalId, ranges);
      return true;
    };

    for (const curated of AGENDA) {
      const curatedService = SERVICES.find((s) => s.key === curated.serviceKey);
      if (!curatedService) continue;
      reserveSlot(
        curated.professionalId,
        at(today, curated.dayOffset, curated.hour, curated.minute),
        curatedService.minutes,
      );
    }

    const agendaRng = makeRng(20260816);

    for (let dayOffset = -HISTORY_DAYS; dayOffset <= FUTURE_DAYS; dayOffset += 1) {
      if (dayOffset === 0) continue; // o dia de hoje já está curado acima
      const weekday = at(today, dayOffset, 12).getDay();
      if (weekday === 0) continue; // domingo fechado
      const saturday = weekday === 6;
      const closingMinutes = saturday ? 13 * 60 : 18 * 60;

      for (const entry of ROSTER) {
        const [minSlots, maxSlots] = entry.slotsPerDay;
        // A agenda futura é mais vazia que a passada, e fica mais vazia quanto
        // mais distante, como numa clínica real. A primeira hora do dia futuro
        // fica livre para encaixe, e é o que garante espaço para agendar.
        const futureFactor = dayOffset > 0 ? 1 - (dayOffset / FUTURE_DAYS) * 0.5 : 1;
        const drawn = minSlots + Math.floor(agendaRng() * (maxSlots - minSlots + 1));
        const target = saturday
          ? Math.max(1, Math.round(minSlots / 2))
          : Math.max(1, Math.round(drawn * futureFactor));
        let cursor = (dayOffset > 0 ? 10 * 60 : 8 * 60) + Math.floor(agendaRng() * 3) * 30;

        for (let slot = 0; slot < target; slot += 1) {
          const serviceKey = pick(agendaRng, entry.serviceKeys);
          const slotService = SERVICES.find((s) => s.key === serviceKey);
          if (!slotService) continue;
          if (cursor + slotService.minutes > closingMinutes) break;

          const hour = Math.floor(cursor / 60);
          const minute = cursor % 60;
          const slotStart = at(today, dayOffset, hour, minute);
          cursor += slotService.minutes + 10;
          if (!saturday && cursor > 12 * 60 && cursor < 13 * 60) cursor = 13 * 60; // intervalo de almoço
          if (!reserveSlot(entry.professionalId, slotStart, slotService.minutes)) continue;

          const roll = agendaRng();
          let status: AgendaSeed['status'] = 'scheduled';
          let encounter: AgendaSeed['encounter'] = undefined;
          if (dayOffset < 0) {
            if (roll < 0.07) {
              status = 'no_show';
            } else if (roll < 0.13) {
              status = 'cancelled';
            } else {
              status = 'completed';
              encounter = 'finished';
            }
          } else if (roll < 0.05) {
            status = 'cancelled';
          } else if (roll < 0.45) {
            status = 'confirmed';
          }

          if (!entry.patientKeys.length) continue;

          AGENDA.push({
            patientKey: pick(agendaRng, entry.patientKeys),
            serviceKey,
            professionalId: entry.professionalId,
            dayOffset,
            hour,
            minute,
            status,
            encounter,
            reason: pick(agendaRng, REASONS[serviceKey] ?? GENERIC_REASONS),
            bulk: true,
          });
        }
      }
    }

    // A numeração de agendamento e de atendimento segue a ordem cronológica.
    AGENDA.sort((a, b) => a.dayOffset - b.dayOffset || a.hour - b.hour || a.minute - b.minute);

    const encounterByTag = new Map<string, string>();

    for (const item of AGENDA) {
      const patientId = patientIds.get(item.patientKey);
      const serviceId = serviceIds.get(item.serviceKey);
      const service = SERVICES.find((s) => s.key === item.serviceKey);
      if (!patientId || !serviceId || !service) continue;

      const patient = PATIENTS.find((p) => p.key === item.patientKey);
      const guardianId = patient ? guardianIds.get(patient.guardianKey) ?? null : null;

      const startAt = at(today, item.dayOffset, item.hour, item.minute);
      const endAt = addMinutes(startAt, service.minutes);
      const appointmentId = uuidv7();
      const number = await nextNumber(client, tenantId, 'appointment');

      await client.query(
        `INSERT INTO scheduling.appointments
           (id, tenant_id, facility_id, number, patient_id, guardian_id, professional_id, service_id,
            status, start_at, end_at, reason, source, confirmed_at, checked_in_at, cancelled_at, cancel_reason,
            created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'staff',$13,$14,$15,$16,$17)`,
        [
          appointmentId,
          tenantId,
          facilityMain,
          number,
          patientId,
          guardianId,
          item.professionalId,
          serviceId,
          item.status,
          iso(startAt),
          iso(endAt),
          item.reason ?? null,
          ['confirmed', 'checked_in', 'in_service', 'completed'].includes(item.status) ? iso(addMinutes(startAt, -180)) : null,
          ['checked_in', 'in_service', 'completed'].includes(item.status) ? iso(addMinutes(startAt, -10)) : null,
          item.status === 'cancelled' ? iso(addMinutes(startAt, -60)) : null,
          item.status === 'cancelled' ? 'Tutor solicitou remarcação' : null,
          userRecep,
        ],
      );

      if (!item.encounter) continue;

      const encounterId = uuidv7();
      const encNumber = await nextNumber(client, tenantId, 'encounter');
      const isField = item.serviceKey === 'atendimento-campo';
      const finished = item.encounter === 'finished';

      await client.query(
        `INSERT INTO clinical.encounters
           (id, tenant_id, facility_id, number, patient_id, appointment_id, service_id, class, status,
            attending_professional_id, arrived_at, started_at, ended_at, chief_complaint, weight_kg,
            primary_diagnosis_summary, disposition, follow_up_due_at, follow_up_reason,
            finished_by, finished_at, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)`,
        [
          encounterId,
          tenantId,
          facilityMain,
          encNumber,
          patientId,
          appointmentId,
          serviceId,
          isField ? 'field' : 'outpatient',
          item.encounter,
          item.professionalId,
          iso(addMinutes(startAt, -10)),
          item.encounter === 'arrived' ? null : iso(startAt),
          finished ? iso(addMinutes(startAt, service.minutes)) : null,
          item.reason ?? null,
          patient?.weightKg ?? null,
          finished ? diagnosisFor(item.patientKey, item.serviceKey) : null,
          finished ? 'discharged' : null,
          finished && item.dayOffset <= -3 ? dateOnly(at(today, item.dayOffset + 30, 9)) : null,
          finished && item.dayOffset <= -3 ? 'Reavaliação clínica' : null,
          finished ? userVet1 : null,
          finished ? iso(addMinutes(startAt, service.minutes)) : null,
          userVet1,
        ],
      );
      if (item.tag) encounterByTag.set(item.tag, encounterId);

      await client.query(
        `UPDATE scheduling.appointments SET encounter_id = $3 WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId, encounterId],
      );

      const signedAt = finished ? iso(addMinutes(startAt, service.minutes)) : null;
      const noteStatus = finished ? 'final' : 'draft';
      const itemSeed = seedFor(`${item.patientKey}|${item.dayOffset}|${item.hour}|${item.minute}`);
      // Os itens curados têm texto clínico próprio. Os gerados em volume usam
      // conteúdo genérico coerente com a espécie e o serviço.
      const content = item.bulk
        ? genericContent(patient, item.serviceKey, makeRng(itemSeed))
        : clinicalContent(item.patientKey, item.serviceKey);

      let sequence = 0;
      for (const [kind, body] of Object.entries(content.notes)) {
        if (!body) continue;
        if (!finished && kind !== 'triage' && kind !== 'chief_complaint' && kind !== 'history') continue;
        await client.query(
          `INSERT INTO clinical.encounter_notes
             (tenant_id, encounter_id, patient_id, kind, body, body_format, author_professional_id,
              author_user_id, status, signed_at, signed_by, sequence, occurred_at)
           VALUES ($1,$2,$3,$4,$5,'plain',$6,$7,$8,$9,$10,$11,$12)`,
          [
            tenantId,
            encounterId,
            patientId,
            kind,
            body,
            item.professionalId,
            userVet1,
            noteStatus,
            signedAt,
            finished ? userVet1 : null,
            sequence,
            iso(addMinutes(startAt, sequence * 3)),
          ],
        );
        sequence += 1;
      }

      for (const observation of content.observations) {
        await client.query(
          `INSERT INTO clinical.observations
             (tenant_id, patient_id, encounter_id, code, value_numeric, value_code, uom, entered_value,
              entered_uom, measured_at, measured_by_professional_id, measured_by_user_id, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'final')`,
          [
            tenantId,
            patientId,
            encounterId,
            observation.code,
            observation.value ?? null,
            observation.valueCode ?? null,
            observation.uom ?? null,
            observation.value !== undefined ? String(observation.value) : (observation.valueCode ?? null),
            observation.uom ?? null,
            iso(addMinutes(startAt, 2)),
            item.professionalId,
            userVet1,
          ],
        );
      }

      if (finished) {
        for (const [rank, diagnosis] of content.diagnoses.entries()) {
          await client.query(
            `INSERT INTO clinical.encounter_diagnoses
               (tenant_id, encounter_id, patient_id, description, kind, rank, recorded_by, recorded_by_professional_id, recorded_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              tenantId,
              encounterId,
              patientId,
              diagnosis.description,
              diagnosis.kind,
              rank + 1,
              userVet1,
              item.professionalId,
              iso(addMinutes(startAt, 15)),
            ],
          );
        }

        for (const prescription of content.prescriptions) {
          const prescriptionId = uuidv7();
          const prescNumber = await nextNumber(client, tenantId, 'prescription');
          await client.query(
            `INSERT INTO clinical.prescriptions
               (id, tenant_id, number, patient_id, encounter_id, professional_id, kind, status,
                issued_at, valid_until, signed_at, signed_by, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'signed',$8,$9,$8,$10,$11,$10)`,
            [
              prescriptionId,
              tenantId,
              prescNumber,
              patientId,
              encounterId,
              item.professionalId,
              prescription.kind,
              iso(addMinutes(startAt, 20)),
              dateOnly(at(today, item.dayOffset + 30, 12)),
              userVet1,
              prescription.notes ?? null,
            ],
          );

          for (const [seq, drug] of prescription.items.entries()) {
            await client.query(
              `INSERT INTO clinical.prescription_items
                 (tenant_id, prescription_id, seq, drug_name, active_ingredient, active_ingredient_normalized,
                  concentration_uom, dose_value, dose_uom, dose_per_kg, computed_dose_value, route,
                  frequency_kind, frequency_value, duration_days, quantity, quantity_uom, instructions,
                  is_controlled, withdrawal_meat_days, withdrawal_milk_days)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
              [
                tenantId,
                prescriptionId,
                seq + 1,
                drug.name,
                drug.ingredient,
                drug.ingredient.toLowerCase(),
                drug.concentration ?? null,
                drug.dose,
                drug.doseUom,
                drug.perKg,
                drug.perKg && patient ? Number((drug.dose * patient.weightKg).toFixed(4)) : drug.dose,
                drug.route,
                'interval_hours',
                drug.everyHours,
                drug.days,
                drug.quantity ?? null,
                drug.quantityUom ?? null,
                drug.instructions,
                drug.controlled ?? false,
                drug.withdrawalMeat ?? null,
                drug.withdrawalMilk ?? null,
              ],
            );
          }
        }

        for (const procedure of content.procedures) {
          await client.query(
            `INSERT INTO clinical.encounter_procedures
               (tenant_id, encounter_id, patient_id, service_id, description, performed_at,
                performed_by, performed_by_professional_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              tenantId,
              encounterId,
              patientId,
              serviceIds.get('procedimento') ?? null,
              procedure,
              iso(addMinutes(startAt, 25)),
              userVet1,
              item.professionalId,
            ],
          );
        }

        // O ciclo de cobrança acompanha a idade do atendimento: o que é antigo
        // já foi faturado ou acertado fora do sistema, o recente segue pendente.
        const billingRoll = makeRng(itemSeed ^ 0x9e3779b9)();
        let chargeStatus: 'pending' | 'invoiced' | 'settled_externally' | 'cancelled' = 'pending';
        if (item.dayOffset <= -30) {
          chargeStatus = billingRoll < 0.7 ? 'invoiced' : billingRoll < 0.95 ? 'settled_externally' : 'cancelled';
        } else if (item.dayOffset <= -7) {
          chargeStatus = billingRoll < 0.55 ? 'invoiced' : billingRoll < 0.9 ? 'pending' : 'settled_externally';
        }

        await client.query(
          `INSERT INTO billing.charge_items
             (tenant_id, facility_id, patient_id, payer_guardian_id, encounter_id, source_table, source_id,
              service_id, description, quantity, unit_price, total, status, occurred_at, created_by)
           VALUES ($1,$2,$3,$4,$5,'clinical.encounters',$5,$6,$7,1,$8,$8,$11,$9,$10)`,
          [
            tenantId,
            facilityMain,
            patientId,
            guardianId,
            encounterId,
            serviceId,
            service.name,
            service.price,
            iso(addMinutes(startAt, service.minutes)),
            userVet1,
            chargeStatus,
          ],
        );

        // Vacinação gerada em volume também registra a carteira de vacinas.
        if (item.bulk && item.serviceKey === 'vacinacao' && patient) {
          const vaccineRng = makeRng(itemSeed ^ 0x5bf03635);
          const catalog = VACCINES_BY_SPECIES[patient.speciesCode] ?? VACCINES_BY_SPECIES.default ?? [];
          const vaccine = catalog.length ? pick(vaccineRng, catalog) : null;
          if (vaccine) {
            const nextDue = at(today, item.dayOffset + 365, 9);
            await client.query(
              `INSERT INTO immunization.immunizations
                 (tenant_id, patient_id, vaccine_name, manufacturer, lot_number, expires_at, administered_at,
                  professional_id, administered_by_user_id, route, site, dose_number, next_due_at, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sc','Região escapular',$10,$11,'completed')`,
              [
                tenantId,
                patientId,
                vaccine.name,
                vaccine.manufacturer,
                `LT${1000 + Math.floor(vaccineRng() * 8999)}`,
                dateOnly(at(today, item.dayOffset + 540, 9)),
                iso(addMinutes(startAt, 5)),
                item.professionalId,
                userVet1,
                1 + Math.floor(vaccineRng() * 3),
                dateOnly(nextDue),
              ],
            );
          }
        }

        // Coleta de exames gerada em volume produz pedido, item e resultado.
        if (item.bulk && item.serviceKey === 'coleta-exames') {
          const examRng = makeRng(itemSeed ^ 0x27d4eb2f);
          const panel = pick(examRng, EXAM_PANELS);
          const catalogId = examByCode.get(panel.code);
          if (catalogId) {
            const orderId = uuidv7();
            const orderNumber = await nextNumber(client, tenantId, 'exam_order');
            const resulted = examRng() < 0.85;
            await client.query(
              `INSERT INTO lab.exam_orders
                 (id, tenant_id, facility_id, number, patient_id, encounter_id, ordered_by_professional_id,
                  ordered_by_user_id, ordered_at, priority, clinical_info, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'routine',$10,$11)`,
              [
                orderId,
                tenantId,
                facilityMain,
                orderNumber,
                patientId,
                encounterId,
                item.professionalId,
                userVet1,
                iso(addMinutes(startAt, 5)),
                item.reason ?? null,
                resulted ? 'resulted' : 'ordered',
              ],
            );

            const orderItemId = uuidv7();
            await client.query(
              `INSERT INTO lab.exam_order_items
                 (id, tenant_id, exam_order_id, exam_catalog_id, laboratory_id, status, collected_at, collected_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                orderItemId,
                tenantId,
                orderId,
                catalogId,
                labInternalId,
                resulted ? 'resulted' : 'collected',
                iso(addMinutes(startAt, 10)),
                userVet1,
              ],
            );

            if (resulted) {
              const resultId = uuidv7();
              await client.query(
                `INSERT INTO lab.exam_results
                   (id, tenant_id, exam_order_item_id, patient_id, released_at, released_by, report_text,
                    interpretation, status, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'final','manual')`,
                [
                  resultId,
                  tenantId,
                  orderItemId,
                  patientId,
                  iso(addMinutes(startAt, 240)),
                  userVet1,
                  'Amostra adequada, sem intercorrências na coleta.',
                  pick(examRng, panel.interpretations),
                ],
              );

              for (const [sort, analyte] of panel.analytes.entries()) {
                const value = between(examRng, analyte.min * 0.85, analyte.max * 1.15, 2);
                const flag = value < analyte.min ? 'low' : value > analyte.max ? 'high' : 'normal';
                await client.query(
                  `INSERT INTO lab.exam_result_values
                     (tenant_id, exam_result_id, analyte_code, analyte_name, value_numeric, uom, ref_min, ref_max, abnormal_flag, sort)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                  [tenantId, resultId, analyte.code, analyte.name, value, analyte.uom, analyte.min, analyte.max, flag, sort],
                );
              }
            }
          }
        }
      }
    }

    // ---------------------------------------------------------- vacinas
    const vaccineSeeds: Array<{ patientKey: string; name: string; manufacturer: string; monthsAgo: number; nextMonths: number; dose: number }> = [
      { patientKey: 'p1', name: 'V10 (polivalente canina)', manufacturer: 'Zoetis', monthsAgo: 10, nextMonths: 2, dose: 3 },
      { patientKey: 'p1', name: 'Antirrábica', manufacturer: 'MSD', monthsAgo: 10, nextMonths: 2, dose: 1 },
      { patientKey: 'p2', name: 'V4 (quádrupla felina)', manufacturer: 'Zoetis', monthsAgo: 0, nextMonths: 12, dose: 2 },
      { patientKey: 'p3', name: 'V8 (polivalente canina)', manufacturer: 'Vencofarma', monthsAgo: 13, nextMonths: -1, dose: 2 },
      { patientKey: 'p11', name: 'V10 (polivalente canina)', manufacturer: 'Zoetis', monthsAgo: 2, nextMonths: 1, dose: 2 },
      { patientKey: 'p12', name: 'Antirrábica', manufacturer: 'MSD', monthsAgo: 11, nextMonths: 1, dose: 1 },
      { patientKey: 'p7', name: 'Influenza equina', manufacturer: 'Boehringer', monthsAgo: 5, nextMonths: 1, dose: 1 },
      { patientKey: 'p8', name: 'Febre aftosa', manufacturer: 'Ourofino', monthsAgo: 4, nextMonths: 2, dose: 1 },
    ];

    for (const vaccine of vaccineSeeds) {
      const patientId = patientIds.get(vaccine.patientKey);
      if (!patientId) continue;
      const administered = new Date();
      administered.setMonth(administered.getMonth() - vaccine.monthsAgo);
      const next = new Date();
      next.setMonth(next.getMonth() + vaccine.nextMonths);

      await client.query(
        `INSERT INTO immunization.immunizations
           (tenant_id, patient_id, vaccine_name, manufacturer, lot_number, expires_at, administered_at,
            professional_id, administered_by_user_id, route, site, dose_number, next_due_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sc','Região escapular',$10,$11,'completed')`,
        [
          tenantId,
          patientId,
          vaccine.name,
          vaccine.manufacturer,
          `LT${String(1000 + Math.abs(vaccine.monthsAgo * 37))}`,
          dateOnly(new Date(administered.getFullYear() + 1, administered.getMonth(), 1)),
          iso(administered),
          vet1,
          userVet1,
          vaccine.dose,
          dateOnly(next),
        ],
      );
    }

    for (const patientKey of ['p1', 'p2', 'p3', 'p11']) {
      const patientId = patientIds.get(patientKey);
      if (!patientId) continue;
      const administered = new Date();
      administered.setMonth(administered.getMonth() - 3);
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      await client.query(
        `INSERT INTO immunization.preventive_treatments
           (tenant_id, patient_id, kind, product_name, administered_at, professional_id,
            administered_by_user_id, dose_text, next_due_at)
         VALUES ($1,$2,'deworming','Vermífugo de amplo espectro',$3,$4,$5,'1 comprimido por 10 kg',$6)`,
        [tenantId, patientId, iso(administered), vet1, userVet1, dateOnly(next)],
      );
    }

    // Carteira da base gerada. O reforço só aparece um ano depois da aplicação,
    // então parte das doses fica datada do ano anterior: é isso que dá conteúdo
    // à tela de reforços vencidos e a vencer.
    const preventiveRng = makeRng(0x07a1c0de);
    for (const generated of PATIENTS) {
      if (!generated.key.startsWith('px')) continue;
      const patientId = patientIds.get(generated.key);
      if (!patientId) continue;

      const catalog = VACCINES_BY_SPECIES[generated.speciesCode] ?? VACCINES_BY_SPECIES.default ?? [];
      for (const vaccine of catalog.slice(0, preventiveRng() < 0.5 ? 2 : 1)) {
        const administeredDay = -365 - Math.floor(preventiveRng() * 45) + Math.floor(preventiveRng() * 90);
        const administered = at(today, administeredDay, 10, 30);
        await client.query(
          `INSERT INTO immunization.immunizations
             (tenant_id, patient_id, vaccine_name, manufacturer, lot_number, expires_at, administered_at,
              professional_id, administered_by_user_id, route, site, dose_number, next_due_at, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sc','Região escapular',$10,$11,'completed')`,
          [
            tenantId,
            patientId,
            vaccine.name,
            vaccine.manufacturer,
            `LT${1000 + Math.floor(preventiveRng() * 8999)}`,
            dateOnly(at(today, administeredDay + 540, 10)),
            iso(administered),
            vet1,
            userVet1,
            1 + Math.floor(preventiveRng() * 3),
            dateOnly(at(today, administeredDay + 365, 10)),
          ],
        );
      }

      if (preventiveRng() < 0.7) {
        const appliedDay = -Math.floor(preventiveRng() * 150);
        const kind = preventiveRng() < 0.6 ? 'deworming' : 'ectoparasite';
        await client.query(
          `INSERT INTO immunization.preventive_treatments
             (tenant_id, patient_id, kind, product_name, administered_at, professional_id,
              administered_by_user_id, dose_text, next_due_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            tenantId,
            patientId,
            kind,
            kind === 'deworming' ? 'Vermífugo de amplo espectro' : 'Antipulgas e carrapatos de uso tópico',
            iso(at(today, appliedDay, 11)),
            vet1,
            userVet1,
            kind === 'deworming' ? '1 comprimido por 10 kg' : '1 pipeta conforme faixa de peso',
            dateOnly(at(today, appliedDay + 90, 11)),
          ],
        );
      }
    }

    // pedido resultado: perfil renal da Nina (paciente renal crônico)
    const ninaId = patientIds.get('p4');
    const ninaEncounter = encounterByTag.get('nina-renal');
    if (ninaId && ninaEncounter) {
      const orderId = uuidv7();
      const orderNumber = await nextNumber(client, tenantId, 'exam_order');
      await client.query(
        `INSERT INTO lab.exam_orders
           (id, tenant_id, facility_id, number, patient_id, encounter_id, ordered_by_professional_id,
            ordered_by_user_id, ordered_at, priority, clinical_info, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'routine','Doença renal crônica em acompanhamento.','resulted')`,
        [orderId, tenantId, facilityMain, orderNumber, ninaId, ninaEncounter, vet1, userVet1, iso(at(today, -14, 11))],
      );

      const renalItem = uuidv7();
      await client.query(
        `INSERT INTO lab.exam_order_items
           (id, tenant_id, exam_order_id, exam_catalog_id, laboratory_id, status, collected_at, collected_by)
         VALUES ($1,$2,$3,$4,$5,'resulted',$6,$7)`,
        [renalItem, tenantId, orderId, examByCode.get('BIOQ_RENAL'), labInternalId, iso(at(today, -14, 11, 30)), userVet1],
      );

      const resultId = uuidv7();
      await client.query(
        `INSERT INTO lab.exam_results
           (id, tenant_id, exam_order_item_id, patient_id, released_at, released_by, report_text,
            interpretation, status, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'final','manual')`,
        [
          resultId,
          tenantId,
          renalItem,
          ninaId,
          iso(at(today, -13, 9)),
          userVet1,
          'Amostra de soro sem hemólise.',
          'Azotemia leve, compatível com DRC estágio 2 estável em relação ao exame anterior.',
        ],
      );

      const renalValues = [
        { code: 'UREA', name: 'Ureia', value: 78.4, uom: 'mg/dL', min: 20, max: 65, flag: 'high' },
        { code: 'CREA', name: 'Creatinina', value: 2.1, uom: 'mg/dL', min: 0.8, max: 1.8, flag: 'high' },
        { code: 'SDMA', name: 'SDMA', value: 17, uom: 'ug/dL', min: 0, max: 14, flag: 'high' },
      ];
      for (const [sort, value] of renalValues.entries()) {
        await client.query(
          `INSERT INTO lab.exam_result_values
             (tenant_id, exam_result_id, analyte_code, analyte_name, value_numeric, uom, ref_min, ref_max, abnormal_flag, sort)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [tenantId, resultId, value.code, value.name, value.value, value.uom, value.min, value.max, value.flag, sort],
        );
      }
    }

    // pedido aguardando resultado: hemograma do Bidu (atendimento em curso)
    const biduId = patientIds.get('p3');
    const biduEncounter = encounterByTag.get('bidu-otite');
    if (biduId && biduEncounter) {
      const orderId = uuidv7();
      const orderNumber = await nextNumber(client, tenantId, 'exam_order');
      await client.query(
        `INSERT INTO lab.exam_orders
           (id, tenant_id, facility_id, number, patient_id, encounter_id, ordered_by_professional_id,
            ordered_by_user_id, priority, clinical_info, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'urgent','Otite recorrente, investigar componente sistêmico.','ordered')`,
        [orderId, tenantId, facilityMain, orderNumber, biduId, biduEncounter, vet1, userVet1],
      );
      for (const code of ['CBC', 'CULT_ANTIB']) {
        await client.query(
          `INSERT INTO lab.exam_order_items (tenant_id, exam_order_id, exam_catalog_id, laboratory_id, status)
           VALUES ($1,$2,$3,$4,'requested')`,
          [tenantId, orderId, examByCode.get(code), code === 'CBC' ? labInternalId : labExternalId],
        );
      }
    }

    // ------------------------------------------- segundo tenant (isolamento)
    // Mesmo caminho do tenant demo: um plano menor, para que a diferença de
    // entitlements entre organizações também apareça na demonstração.
    const beta = await provisionTenant(
      client,
      {
        slug: 'beta',
        name: 'Pet Clinic Beta',
        planKey: 'solo',
        status: 'active',
        settings: { demo: true },
        facility: { name: 'Unidade Central', code: 'CEN' },
        owner: { email: 'beta@chiron.dev', name: 'Sofia Andrade', passwordHash },
      },
      crypto,
    );
    const betaTenantId = beta.tenantId;
    const betaFacility = beta.facilityId;

    const betaGuardianId = uuidv7();
    await client.query(
      `INSERT INTO registry.guardians (id, tenant_id, number, name, document_kind, email, phone_primary)
       VALUES ($1,$2,$3,'Cliente Beta','none','cliente.beta@exemplo.dev','(21) 98800-1122')`,
      [betaGuardianId, betaTenantId, await nextNumber(client, betaTenantId, 'guardian')],
    );

    const betaPatientId = uuidv7();
    await client.query(
      `INSERT INTO registry.patients
         (id, tenant_id, number, name, species_id, sex, reproductive_status, current_weight_kg, status, origin_facility_id)
       VALUES ($1,$2,$3,'Paciente Beta',$4,'male','intact',9.5,'active',$5)`,
      [
        betaPatientId,
        betaTenantId,
        await nextNumber(client, betaTenantId, 'patient'),
        speciesByCode.get('dog'),
        betaFacility,
      ],
    );
    await client.query(
      `INSERT INTO registry.patient_guardians (tenant_id, patient_id, guardian_id, role, is_primary)
       VALUES ($1,$2,$3,'owner',true)`,
      [betaTenantId, betaPatientId, betaGuardianId],
    );

    // o proprietário do tenant demo também é membro do beta: exercita a troca
    const crossMembershipId = uuidv7();
    await client.query(
      `INSERT INTO iam.memberships (id, tenant_id, user_id, status, is_owner, all_facilities, default_facility_id)
       VALUES ($1,$2,$3,'active',false,true,$4)`,
      [crossMembershipId, betaTenantId, userIds.get('owner'), betaFacility],
    );
    await client.query(`INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id) VALUES ($1,$2,$3)`, [
      crossMembershipId,
      ownerRoleId,
      betaTenantId,
    ]);

    await client.query('COMMIT');

    log('');
    log('Seed de demonstração concluído.');
    log('');
    log('  Tenant demo:  Clínica Veterinária Aurora (slug: demo)');
    log('  Tenant beta:  Pet Clinic Beta (slug: beta)');
    log('');
    log(`  Acessos (senha para todos: ${DEMO_PASSWORD})`);
    for (const user of DEMO_USERS) {
      log(`    ${user.email.padEnd(24)} ${user.name} (${user.roleKeys.join(', ')})`);
    }
    log(`    ${'beta@chiron.dev'.padEnd(24)} Sofia Andrade (outro tenant)`);
    log('');
    log(`  ${PATIENTS.length} pacientes, ${GUARDIANS.length} tutores, ${AGENDA.length} agendamentos.`);
    log('');

    return {
      tenantId,
      betaTenantId,
      password: DEMO_PASSWORD,
      users: DEMO_USERS.map((u) => ({ email: u.email, name: u.name, roles: u.roleKeys })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Algumas tabelas são append-only: um gatilho recusa DELETE nelas (log de
 * auditoria, notas clínicas, movimentação de estoque). Como remover o tenant de
 * demonstração cascateia até essas tabelas, a limpeza precisa suspender os
 * gatilhos, e só o dono da tabela pode fazer isso. Por isso roda numa conexão
 * própria, com o papel de migração.
 *
 * As tabelas saem do catálogo em vez de uma lista fixa, para que um gatilho
 * novo em outra migração não volte a quebrar o seed.
 */
const APP_SCHEMAS = [
  'platform', 'iam', 'registry', 'scheduling', 'clinical',
  'lab', 'immunization', 'documents', 'billing', 'inventory', 'audit',
];

async function purgeDemoTenants(connectionString: string): Promise<void> {
  const owner = new Client({ connectionString });
  await owner.connect();
  try {
    const { rows } = await owner.query<{ table_name: string }>(
      `SELECT DISTINCT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS table_name
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND (t.tgtype & 8) <> 0
          AND n.nspname = ANY($1::text[])`,
      [APP_SCHEMAS],
    );

    await owner.query('BEGIN');
    for (const { table_name: table } of rows) {
      await owner.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    }
    await owner.query(`DELETE FROM platform.tenants WHERE slug IN ('demo','beta')`);
    for (const { table_name: table } of rows) {
      await owner.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    }
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  } finally {
    await owner.end();
  }
}

async function nextNumber(client: Client, tenantId: string, kind: string): Promise<string> {
  const { rows } = await client.query<{ next_number: string }>(`SELECT platform.next_number($1,$2) AS next_number`, [
    tenantId,
    kind,
  ]);
  return rows[0]?.next_number ?? '1';
}

function diagnosisFor(patientKey: string, serviceKey: string): string {
  if (serviceKey === 'vacinacao') return 'Animal hígido, apto à vacinação';
  const map: Record<string, string> = {
    p1: 'Osteoartrite de joelho direito',
    p4: 'Doença renal crônica estágio 2 (IRIS)',
    p5: 'Hipovitaminose A',
    p8: 'Mastite subclínica no quarto anterior esquerdo',
    p7: 'Cólica espasmódica',
  };
  return map[patientKey] ?? 'Quadro clínico em investigação';
}

interface DrugSeed {
  name: string;
  ingredient: string;
  concentration?: string;
  dose: number;
  doseUom: string;
  perKg: boolean;
  route: string;
  everyHours: number;
  days: number;
  quantity?: number;
  quantityUom?: string;
  instructions: string;
  controlled?: boolean;
  withdrawalMeat?: number;
  withdrawalMilk?: number;
}

interface ClinicalContent {
  notes: Record<string, string | undefined>;
  observations: Array<{ code: string; value?: number; valueCode?: string; uom?: string }>;
  diagnoses: Array<{ description: string; kind: 'differential' | 'presumptive' | 'final' | 'ruled_out' }>;
  prescriptions: Array<{ kind: 'simple' | 'controlled'; notes?: string; items: DrugSeed[] }>;
  procedures: string[];
}

function clinicalContent(patientKey: string, serviceKey: string): ClinicalContent {
  const base: ClinicalContent = {
    notes: {},
    observations: [],
    diagnoses: [],
    prescriptions: [],
    procedures: [],
  };

  if (serviceKey === 'vacinacao') {
    return {
      notes: {
        triage: 'Animal ativo, sem queixas. Peso e temperatura dentro do esperado.',
        physical_exam: 'Exame físico geral sem alterações. Mucosas normocoradas, TPC 2 segundos, linfonodos normais.',
        plan: 'Aplicada vacina conforme protocolo. Orientado sobre reações esperadas nas primeiras 48 horas.',
      },
      observations: [
        { code: 'temperature', value: 38.6, uom: 'C' },
        { code: 'heart_rate', value: 172, uom: 'bpm' },
        { code: 'respiratory_rate', value: 28, uom: 'mpm' },
        { code: 'mucous_membranes', valueCode: 'rosadas' },
      ],
      diagnoses: [{ description: 'Animal hígido, apto à vacinação', kind: 'final' }],
      prescriptions: [],
      procedures: ['Aplicação de vacina por via subcutânea'],
    };
  }

  switch (patientKey) {
    case 'p1':
      return {
        notes: {
          triage: 'Chega andando, apoia parcialmente o membro posterior direito. Dor à manipulação do joelho.',
          chief_complaint: 'Claudicação intermitente no membro posterior direito há duas semanas, pior após corrida.',
          history:
            'Cão de 6 anos, castrado, atividade física intensa nos finais de semana. Sem histórico de trauma agudo. Alimentação comercial premium. Vermifugado há 3 meses.',
          physical_exam:
            'Escore corporal 6/9. Dor à extensão do joelho direito, crepitação leve, teste de gaveta negativo. Demais articulações sem alteração. Ausculta cardiorrespiratória normal.',
          assessment:
            'Quadro compatível com osteoartrite de joelho direito, sem instabilidade ligamentar detectável ao exame físico.',
          plan: 'Anti-inflamatório por 7 dias, repouso relativo por 14 dias, controle de peso e radiografia de controle em 30 dias. Orientado retorno imediato se piora.',
        },
        observations: [
          { code: 'temperature', value: 38.4, uom: 'C' },
          { code: 'heart_rate', value: 96, uom: 'bpm' },
          { code: 'respiratory_rate', value: 24, uom: 'mpm' },
          { code: 'body_condition_score', value: 6 },
          { code: 'pain_score', value: 2 },
          { code: 'mucous_membranes', valueCode: 'rosadas' },
          { code: 'capillary_refill_time', value: 2, uom: 's' },
        ],
        diagnoses: [
          { description: 'Osteoartrite de joelho direito', kind: 'presumptive' },
          { description: 'Ruptura de ligamento cruzado cranial', kind: 'differential' },
        ],
        prescriptions: [
          {
            kind: 'simple',
            notes: 'Administrar sempre após a refeição. Suspender e comunicar em caso de vômito ou fezes escurecidas.',
            items: [
              {
                name: 'Meloxicam 2 mg comprimido',
                ingredient: 'Meloxicam',
                concentration: '2 mg',
                dose: 0.1,
                doseUom: 'mg',
                perKg: true,
                route: 'oral',
                everyHours: 24,
                days: 7,
                quantity: 7,
                quantityUom: 'comprimido',
                instructions: 'Dose de ataque no primeiro dia, depois metade da dose. Administrar após a refeição.',
              },
              {
                name: 'Condroitina e glucosamina',
                ingredient: 'Sulfato de condroitina',
                dose: 1,
                doseUom: 'comprimido',
                perKg: false,
                route: 'oral',
                everyHours: 24,
                days: 90,
                quantity: 90,
                quantityUom: 'comprimido',
                instructions: 'Uso contínuo por 90 dias, com reavaliação ao final.',
              },
            ],
          },
        ],
        procedures: [],
      };

    case 'p4':
      return {
        notes: {
          triage: 'Gata alerta, discretamente desidratada. Tutor relata aumento no consumo de água.',
          chief_complaint: 'Reavaliação de doença renal crônica. Polidipsia mantida.',
          history:
            'Felina de 8 anos, castrada, diagnóstico de DRC há 14 meses. Em ração renal desde então. Sem vômitos no último mês.',
          physical_exam:
            'Escore corporal 4/9. Desidratação estimada em 5%. Rins de tamanho reduzido à palpação, irregulares. Mucosas levemente pálidas. Pressão arterial dentro do alvo.',
          assessment: 'DRC estágio 2 estável. Sem evidência de crise urêmica.',
          plan: 'Manter ração renal, fluidoterapia subcutânea domiciliar 2x por semana, controle de ureia e creatinina em 60 dias. Orientada oferta abundante de água.',
        },
        observations: [
          { code: 'temperature', value: 38.2, uom: 'C' },
          { code: 'heart_rate', value: 188, uom: 'bpm' },
          { code: 'respiratory_rate', value: 32, uom: 'mpm' },
          { code: 'systolic_bp', value: 148, uom: 'mmHg' },
          { code: 'hydration', value: 5, uom: '%' },
          { code: 'body_condition_score', value: 4 },
        ],
        diagnoses: [{ description: 'Doença renal crônica estágio 2 (IRIS)', kind: 'final' }],
        prescriptions: [
          {
            kind: 'simple',
            items: [
              {
                name: 'Ração terapêutica renal',
                ingredient: 'Dieta renal',
                dose: 55,
                doseUom: 'g',
                perKg: false,
                route: 'oral',
                everyHours: 12,
                days: 60,
                instructions: 'Exclusiva. Não oferecer petiscos ou alimentos caseiros.',
              },
              {
                name: 'Solução de Ringer com lactato 500 mL',
                ingredient: 'Ringer lactato',
                dose: 100,
                doseUom: 'mL',
                perKg: false,
                route: 'sc',
                everyHours: 84,
                days: 60,
                quantity: 4,
                quantityUom: 'bolsa',
                instructions: 'Aplicar 100 mL por via subcutânea duas vezes por semana, conforme demonstrado.',
              },
            ],
          },
        ],
        procedures: ['Fluidoterapia subcutânea 100 mL'],
      };

    case 'p5':
      return {
        notes: {
          triage: 'Ave apática, penas arrepiadas, permanece no fundo da gaiola.',
          chief_complaint: 'Apatia e penas arrepiadas há 5 dias.',
          history:
            'Calopsita macho de 2 anos e 6 meses, alimentação baseada em sementes de girassol, sem exposição a luz solar direta. Sem contato com outras aves.',
          physical_exam:
            'Peso 92 g. Escore corporal 2/5. Narinas com discreta secreção seca. Cavidade oral com placas esbranquiçadas em palato. Ausculta pulmonar sem ruídos adventícios.',
          assessment:
            'Quadro compatível com hipovitaminose A secundária a dieta exclusiva de sementes, com metaplasia escamosa de mucosa oral.',
          plan: 'Correção alimentar gradual para extrusado, suplementação de vitamina A, exposição controlada à luz solar. Retorno em 15 dias.',
        },
        observations: [
          { code: 'weight', value: 0.092, uom: 'kg' },
          { code: 'temperature', value: 41.2, uom: 'C' },
          { code: 'heart_rate', value: 280, uom: 'bpm' },
          { code: 'respiratory_rate', value: 60, uom: 'mpm' },
          { code: 'body_condition_score', value: 2 },
        ],
        diagnoses: [
          { description: 'Hipovitaminose A', kind: 'presumptive' },
          { description: 'Candidíase oral', kind: 'differential' },
        ],
        prescriptions: [
          {
            kind: 'simple',
            notes: 'Transição alimentar em 21 dias, misturando extrusado ao alimento atual em proporção crescente.',
            items: [
              {
                name: 'Vitamina A injetável',
                ingredient: 'Retinol',
                dose: 0.02,
                doseUom: 'mL',
                perKg: false,
                route: 'im',
                everyHours: 168,
                days: 21,
                quantity: 1,
                quantityUom: 'frasco',
                instructions: 'Aplicação semanal na clínica, três aplicações no total.',
              },
            ],
          },
        ],
        procedures: ['Coleta de swab oral para citologia'],
      };

    case 'p7':
      return {
        notes: {
          triage: 'Égua inquieta, olha para o flanco, sudorese discreta.',
          chief_complaint: 'Desconforto abdominal iniciado há 4 horas.',
          history:
            'Égua de 9 anos, mantida a pasto com suplementação. Mudança recente de lote de feno. Última vermifugação há 5 meses.',
          physical_exam:
            'Frequência cardíaca 52 bpm, mucosas rosadas, TPC 2 segundos. Motilidade intestinal aumentada em quadrantes esquerdos. Sondagem nasogástrica sem refluxo. Palpação retal sem deslocamentos.',
          assessment: 'Cólica espasmódica, sem sinais de abdome cirúrgico.',
          plan: 'Analgesia, jejum de 6 horas, retorno gradual à alimentação, reavaliação em 12 horas. Revisar programa de vermifugação.',
        },
        observations: [
          { code: 'temperature', value: 37.9, uom: 'C' },
          { code: 'heart_rate', value: 52, uom: 'bpm' },
          { code: 'respiratory_rate', value: 18, uom: 'mpm' },
          { code: 'mucous_membranes', valueCode: 'rosadas' },
          { code: 'pain_score', value: 3 },
        ],
        diagnoses: [
          { description: 'Cólica espasmódica', kind: 'presumptive' },
          { description: 'Impactação de cólon maior', kind: 'ruled_out' },
        ],
        prescriptions: [
          {
            kind: 'simple',
            items: [
              {
                name: 'Dipirona sódica 500 mg/mL',
                ingredient: 'Dipirona',
                concentration: '500 mg/mL',
                dose: 25,
                doseUom: 'mg',
                perKg: true,
                route: 'iv',
                everyHours: 12,
                days: 2,
                quantity: 1,
                quantityUom: 'frasco',
                instructions: 'Aplicação lenta por via intravenosa.',
              },
            ],
          },
        ],
        procedures: ['Sondagem nasogástrica', 'Palpação retal'],
      };

    case 'p8':
      return {
        notes: {
          triage: 'Vaca em lactação, escore corporal 3/5, sem sinais sistêmicos.',
          chief_complaint: 'Queda de produção e alteração no CMT do quarto anterior esquerdo.',
          history:
            'Vaca girolando, 5 anos, terceira lactação, 21 litros por dia até uma semana atrás. Ordenha mecânica duas vezes ao dia. Rebanho com histórico de mastite subclínica.',
          physical_exam:
            'Temperatura 38,9 C. Úbere sem sinais flogísticos evidentes. CMT escore 3 no quarto anterior esquerdo, escore 1 nos demais. Leite sem grumos visíveis.',
          assessment: 'Mastite subclínica no quarto anterior esquerdo.',
          plan: 'Coleta de leite para cultura e antibiograma. Tratamento intramamário conforme resultado. Reforçar higiene de ordenha e pós-dipping.',
        },
        observations: [
          { code: 'temperature', value: 38.9, uom: 'C' },
          { code: 'heart_rate', value: 68, uom: 'bpm' },
          { code: 'respiratory_rate', value: 24, uom: 'mpm' },
          { code: 'rumen_motility', value: 3 },
          { code: 'body_condition_score', value: 3 },
        ],
        diagnoses: [{ description: 'Mastite subclínica no quarto anterior esquerdo', kind: 'presumptive' }],
        prescriptions: [
          {
            kind: 'simple',
            notes: 'Respeitar rigorosamente o período de carência. Leite do animal descartado durante o tratamento.',
            items: [
              {
                name: 'Cefquinoma intramamário',
                ingredient: 'Cefquinoma',
                concentration: '75 mg/seringa',
                dose: 1,
                doseUom: 'seringa',
                perKg: false,
                route: 'intramammary',
                everyHours: 12,
                days: 3,
                quantity: 6,
                quantityUom: 'seringa',
                instructions: 'Aplicar após ordenha completa do quarto afetado, com higiene rigorosa do teto.',
                withdrawalMeat: 4,
                withdrawalMilk: 5,
              },
            ],
          },
        ],
        procedures: ['California Mastitis Test nos quatro quartos', 'Coleta asséptica de leite para cultura'],
      };

    case 'p3':
      return {
        notes: {
          triage: 'Cão agitado, sacode a cabeça com frequência. Odor característico no ouvido direito.',
          chief_complaint: 'Otite recorrente, quarto episódio no ano.',
          history:
            'Cão sem raça definida, 8 anos, não castrado. Banhos quinzenais em pet shop. Episódios anteriores tratados com medicação tópica, com melhora parcial e recidiva em 6 a 8 semanas.',
        },
        observations: [
          { code: 'temperature', value: 38.7, uom: 'C' },
          { code: 'heart_rate', value: 104, uom: 'bpm' },
          { code: 'respiratory_rate', value: 26, uom: 'mpm' },
        ],
        diagnoses: [],
        prescriptions: [],
        procedures: [],
      };

    case 'p9':
      return {
        notes: {
          triage: 'Coelha alerta, aceita manipulação. Fezes em menor quantidade na caixa de transporte.',
          chief_complaint: 'Redução do apetite há 2 dias.',
          history: 'Coelha de 1 ano e 6 meses, dieta com feno à vontade e ração peletizada. Sem contato com outros animais.',
        },
        observations: [
          { code: 'temperature', value: 39.1, uom: 'C' },
          { code: 'heart_rate', value: 220, uom: 'bpm' },
          { code: 'weight', value: 1.72, uom: 'kg' },
        ],
        diagnoses: [],
        prescriptions: [],
        procedures: [],
      };

    default:
      return base;
  }
}


// ============================================ conteúdo dos itens em volume
// Faixas fisiológicas por espécie. Servem para gerar sinais vitais plausíveis
// nos atendimentos de volume, sem precisar de texto clínico escrito à mão.
const VITAL_RANGES: Record<string, { temp: [number, number]; hr: [number, number]; rr: [number, number] }> = {
  dog: { temp: [37.9, 39.2], hr: [70, 130], rr: [18, 34] },
  cat: { temp: [38.0, 39.2], hr: [140, 200], rr: [20, 40] },
  bird: { temp: [40.0, 42.0], hr: [300, 500], rr: [25, 45] },
  reptile: { temp: [24.0, 32.0], hr: [40, 80], rr: [8, 20] },
  horse: { temp: [37.2, 38.5], hr: [28, 44], rr: [8, 16] },
  cattle: { temp: [37.8, 39.3], hr: [48, 84], rr: [18, 30] },
  rabbit: { temp: [38.3, 39.5], hr: [180, 250], rr: [30, 60] },
  rodent: { temp: [37.0, 39.0], hr: [250, 400], rr: [40, 80] },
};

const VACCINES_BY_SPECIES: Record<string, Array<{ name: string; manufacturer: string }>> = {
  dog: [
    { name: 'V10 (polivalente canina)', manufacturer: 'Zoetis' },
    { name: 'Antirrábica', manufacturer: 'MSD' },
    { name: 'Tosse dos canis (Bordetella)', manufacturer: 'Zoetis' },
  ],
  cat: [
    { name: 'V4 (quádrupla felina)', manufacturer: 'Zoetis' },
    { name: 'Antirrábica', manufacturer: 'MSD' },
    { name: 'Leucemia felina (FeLV)', manufacturer: 'Boehringer' },
  ],
  rabbit: [{ name: 'Mixomatose', manufacturer: 'Filavie' }],
  horse: [
    { name: 'Influenza equina', manufacturer: 'Boehringer' },
    { name: 'Tétano', manufacturer: 'Zoetis' },
  ],
  cattle: [
    { name: 'Febre aftosa', manufacturer: 'Ourofino' },
    { name: 'Clostridioses', manufacturer: 'MSD' },
  ],
  default: [{ name: 'Antirrábica', manufacturer: 'MSD' }],
};

interface AnalyteSeed {
  code: string;
  name: string;
  uom: string;
  min: number;
  max: number;
}

const EXAM_PANELS: Array<{ code: string; analytes: AnalyteSeed[]; interpretations: string[] }> = [
  {
    code: 'CBC',
    analytes: [
      { code: 'RBC', name: 'Hemácias', uom: 'milhões/uL', min: 5.5, max: 8.5 },
      { code: 'HGB', name: 'Hemoglobina', uom: 'g/dL', min: 12, max: 18 },
      { code: 'HCT', name: 'Hematócrito', uom: '%', min: 37, max: 55 },
      { code: 'WBC', name: 'Leucócitos totais', uom: '/uL', min: 6000, max: 17000 },
      { code: 'PLT', name: 'Plaquetas', uom: '/uL', min: 200000, max: 500000 },
    ],
    interpretations: [
      'Série vermelha e branca dentro da normalidade.',
      'Discreta leucocitose, sem desvio à esquerda.',
      'Sem alterações relevantes para a queixa apresentada.',
    ],
  },
  {
    code: 'BIOQ_RENAL',
    analytes: [
      { code: 'UREA', name: 'Ureia', uom: 'mg/dL', min: 20, max: 65 },
      { code: 'CREA', name: 'Creatinina', uom: 'mg/dL', min: 0.8, max: 1.8 },
      { code: 'SDMA', name: 'SDMA', uom: 'ug/dL', min: 0, max: 14 },
    ],
    interpretations: [
      'Função renal preservada no momento da coleta.',
      'Valores no limite superior, sugerida repetição em 30 dias.',
      'Sem azotemia. Manter acompanhamento de rotina.',
    ],
  },
];

const GENERIC_DIAGNOSES: Record<string, string[]> = {
  consulta: [
    'Gastroenterite inespecífica',
    'Dermatite alérgica',
    'Doença periodontal grau 2',
    'Otite externa',
    'Obesidade',
    'Traqueobronquite',
  ],
  retorno: ['Evolução favorável do quadro anterior', 'Quadro em remissão', 'Boa resposta ao tratamento instituído'],
  emergencia: ['Gastroenterite aguda', 'Desidratação moderada', 'Dor abdominal em investigação'],
  'consulta-exotico': ['Erro de manejo alimentar', 'Estase gastrintestinal', 'Hipovitaminose'],
  'atendimento-campo': ['Casco com lesão de linha branca', 'Endoparasitose', 'Balanço energético negativo'],
  procedimento: ['Ferida cutânea em cicatrização', 'Abscesso subcutâneo drenado'],
  teleorientacao: ['Orientação prestada, sem sinais de urgência'],
  'exame-imagem': ['Exame de imagem sem achados relevantes'],
  'coleta-exames': ['Coleta realizada para investigação'],
};

const GENERIC_DRUGS: DrugSeed[] = [
  {
    name: 'Meloxicam 0,5 mg/mL',
    ingredient: 'Meloxicam',
    concentration: '0,5 mg/mL',
    dose: 0.1,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'oral',
    everyHours: 24,
    days: 3,
    instructions: 'Administrar após a alimentação, uma vez ao dia.',
  },
  {
    name: 'Amoxicilina com clavulanato 250 mg',
    ingredient: 'Amoxicilina',
    concentration: '250 mg',
    dose: 12.5,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'oral',
    everyHours: 12,
    days: 7,
    instructions: 'Completar o ciclo mesmo com melhora dos sinais.',
  },
  {
    name: 'Omeprazol 10 mg',
    ingredient: 'Omeprazol',
    concentration: '10 mg',
    dose: 1,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'oral',
    everyHours: 24,
    days: 10,
    instructions: 'Administrar em jejum, 30 minutos antes da primeira refeição.',
  },
  {
    name: 'Metronidazol 250 mg',
    ingredient: 'Metronidazol',
    concentration: '250 mg',
    dose: 15,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'oral',
    everyHours: 12,
    days: 5,
    instructions: 'Administrar com alimento para reduzir náusea.',
  },
];

const LARGE_ANIMAL_DRUGS: DrugSeed[] = [
  {
    name: 'Oxitetraciclina longa ação',
    ingredient: 'Oxitetraciclina',
    concentration: '200 mg/mL',
    dose: 20,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'intramuscular',
    everyHours: 48,
    days: 4,
    instructions: 'Dividir o volume em dois pontos de aplicação.',
    withdrawalMeat: 28,
    withdrawalMilk: 7,
  },
  {
    name: 'Flunixin meglumine',
    ingredient: 'Flunixin',
    concentration: '50 mg/mL',
    dose: 1.1,
    doseUom: 'mg/kg',
    perKg: true,
    route: 'intravenous',
    everyHours: 24,
    days: 3,
    instructions: 'Aplicação lenta, estritamente intravenosa.',
    withdrawalMeat: 10,
    withdrawalMilk: 4,
  },
];

const GENERIC_PROCEDURES = [
  'Aferição de sinais vitais',
  'Limpeza otológica',
  'Curativo simples',
  'Tricotomia e antissepsia',
  'Fluidoterapia subcutânea',
];

/** Semente estável a partir de um texto, para o volume sair igual a cada seed. */
function seedFor(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Conteúdo clínico dos atendimentos gerados em volume. Não substitui os casos
 * curados: serve para que todo atendimento do histórico tenha nota, sinal
 * vital, diagnóstico e, parte deles, receita e procedimento.
 */
function genericContent(patient: SeedPatient | undefined, serviceKey: string, rng: () => number): ClinicalContent {
  const species = patient?.speciesCode ?? 'dog';
  const vitals = VITAL_RANGES[species] ?? VITAL_RANGES.dog;
  const large = species === 'horse' || species === 'cattle';

  if (serviceKey === 'banho-tosa') {
    return { notes: {}, observations: [], diagnoses: [], prescriptions: [], procedures: [] };
  }

  const observations: ClinicalContent['observations'] = [];
  if (vitals) {
    observations.push({ code: 'temperature', value: between(rng, vitals.temp[0], vitals.temp[1], 1), uom: 'C' });
    observations.push({ code: 'heart_rate', value: between(rng, vitals.hr[0], vitals.hr[1]), uom: 'bpm' });
    observations.push({ code: 'respiratory_rate', value: between(rng, vitals.rr[0], vitals.rr[1]), uom: 'mpm' });
  }
  if (patient) {
    const drift = 0.95 + rng() * 0.1;
    observations.push({ code: 'weight', value: Number((patient.weightKg * drift).toFixed(3)), uom: 'kg' });
  }
  if (rng() < 0.6) observations.push({ code: 'mucous_membranes', valueCode: 'rosadas' });
  if (rng() < 0.4) observations.push({ code: 'capillary_refill_time', value: between(rng, 1, 2, 1), uom: 's' });
  if (rng() < 0.3) observations.push({ code: 'body_condition_score', value: between(rng, 4, 7), uom: 'escore' });

  const diagnosisPool = GENERIC_DIAGNOSES[serviceKey] ?? GENERIC_DIAGNOSES.consulta ?? [];
  const diagnosis = diagnosisPool.length ? pick(rng, diagnosisPool) : 'Quadro clínico em investigação';

  const notes: ClinicalContent['notes'] = {
    triage: pick(rng, [
      'Animal alerta, responsivo ao manejo.',
      'Paciente calmo, aceita contenção sem resistência.',
      'Animal apreensivo, contenção mínima suficiente.',
    ]),
    physical_exam: [
      'Exame físico geral sem alterações significativas fora da queixa.',
      'Mucosas normocoradas e linfonodos sem alteração à palpação.',
      'Auscultação cardiorrespiratória sem sopros ou ruídos adventícios.',
    ].join(' '),
    assessment: diagnosis,
    plan: pick(rng, [
      'Tratamento instituído e orientações repassadas ao tutor. Retorno em 15 dias.',
      'Manter dieta atual e reavaliar em 30 dias.',
      'Orientado sinal de alerta para retorno imediato.',
      'Solicitados exames complementares para fechar o diagnóstico.',
    ]),
  };

  const prescriptions: ClinicalContent['prescriptions'] = [];
  if (serviceKey !== 'teleorientacao' && serviceKey !== 'coleta-exames' && rng() < 0.65) {
    const pool = large ? LARGE_ANIMAL_DRUGS : GENERIC_DRUGS;
    const first = pick(rng, pool);
    const items: DrugSeed[] = [first];
    if (rng() < 0.35) {
      const second = pick(rng, pool);
      if (second.name !== first.name) items.push(second);
    }
    prescriptions.push({
      kind: 'simple',
      notes: large ? 'Respeitar o período de carência informado para carne e leite.' : undefined,
      items,
    });
  }

  const procedures: string[] = [];
  if (rng() < 0.4) procedures.push(pick(rng, GENERIC_PROCEDURES));

  return { notes, observations, diagnoses: [{ description: diagnosis, kind: 'final' }], prescriptions, procedures };
}
