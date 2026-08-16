import { Client } from 'pg';
import { hash as argonHash } from '@node-rs/argon2';
import { LICENSE_REQUIRED_PERMISSIONS, PLANS, ROLE_TEMPLATES } from '@chiron/contracts';
import { env } from '../config/env';
import { CryptoService } from '../common/crypto.service';
import { uuidv7 } from '../common/uuid';

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

async function main(): Promise<void> {
  const cfg = env();
  if (cfg.APP_ENV === 'prod' || cfg.NODE_ENV === 'production') {
    throw new Error('O seed de demonstração não pode rodar em produção.');
  }

  const url = cfg.DATABASE_ADMIN_URL ?? cfg.DATABASE_MIGRATION_URL ?? cfg.DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  const crypto = new CryptoService();
  const passwordHash = await argonHash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  try {
    await client.query('BEGIN');

    const existing = await client.query<{ id: string }>(`SELECT id FROM platform.tenants WHERE slug IN ('demo','beta')`);
    if (existing.rowCount) {
      console.log('Removendo dados de demonstração anteriores...');
      await client.query(`DELETE FROM platform.tenants WHERE slug IN ('demo','beta')`);
    }

    const planRow = await client.query<{ id: string }>(`SELECT id FROM platform.plans WHERE key = 'hospital'`);
    const planId = planRow.rows[0]?.id;
    if (!planId) throw new Error('Plano "hospital" não encontrado. Rode a migração antes do seed.');

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
    const tenantId = uuidv7();
    await client.query(
      `INSERT INTO platform.tenants (id, slug, name, status, plan_id, timezone, locale, settings)
       VALUES ($1,'demo','Clínica Veterinária Aurora','active',$2,'America/Sao_Paulo','pt-BR',$3)`,
      [
        tenantId,
        planId,
        JSON.stringify({
          prescriptionHeader: 'Rua das Acácias, 1420 - Pinheiros, São Paulo/SP - (11) 3555-8800 - CRMV-SP 12345',
          finishRequiresOwnEncounter: false,
          demo: true,
        }),
      ],
    );

    const planModules = PLANS.find((p) => p.key === 'hospital')?.modules ?? [];
    for (const moduleKey of planModules) {
      await client.query(
        `INSERT INTO platform.tenant_entitlements (tenant_id, module_key, state, source)
         VALUES ($1,$2,'active','plan')`,
        [tenantId, moduleKey],
      );
    }

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
        JSON.stringify({ street: 'Rua das Acácias', number: '1420', district: 'Pinheiros', city: 'São Paulo', state: 'SP', zip: '05432-000' }),
      ],
    );

    const facilityMain = uuidv7();
    const facilityUnit = uuidv7();
    await client.query(
      `INSERT INTO platform.facilities (id, tenant_id, legal_entity_id, name, code, kind, address, phone, timezone, is_default)
       VALUES ($1,$2,$3,'Unidade Pinheiros','PIN','clinic',$4,'(11) 3555-8800','America/Sao_Paulo',true),
              ($5,$2,$3,'Unidade Santana','SAN','clinic',$6,'(11) 3555-8811','America/Sao_Paulo',false)`,
      [
        facilityMain,
        tenantId,
        legalEntityId,
        JSON.stringify({ street: 'Rua das Acácias', number: '1420', district: 'Pinheiros', city: 'São Paulo', state: 'SP', zip: '05432-000' }),
        facilityUnit,
        JSON.stringify({ street: 'Avenida Braz Leme', number: '980', district: 'Santana', city: 'São Paulo', state: 'SP', zip: '02511-000' }),
      ],
    );

    // ------------------------------------------------------------- papéis
    const roleIds = new Map<string, string>();
    for (const template of ROLE_TEMPLATES) {
      const roleId = uuidv7();
      await client.query(
        `INSERT INTO iam.roles (id, tenant_id, key, name, description, template_key, template_version, is_system, requires_license, sort)
         VALUES ($1,$2,$3,$4,$5,$3,1,true,$6,$7)`,
        [roleId, tenantId, template.key, template.name, template.description, template.clinical, template.sort],
      );
      roleIds.set(template.key, roleId);

      for (const permission of template.permissions) {
        await client.query(
          `INSERT INTO iam.role_permissions (role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [roleId, permission],
        );
      }
    }

    // ----------------------------------------------------- usuários e time
    const userIds = new Map<string, string>();
    const professionalIds = new Map<string, string>();

    for (const seedUser of DEMO_USERS) {
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
    const ownerVetKeys = ['vet1', 'vet2', 'vet3'];
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
    }

    const AGENDA: AgendaSeed[] = [
      { patientKey: 'p1', serviceKey: 'consulta', professionalId: vet1, dayOffset: -21, hour: 9, minute: 0, status: 'completed', encounter: 'finished', reason: 'Claudicação no membro posterior direito' },
      { patientKey: 'p4', serviceKey: 'consulta', professionalId: vet1, dayOffset: -14, hour: 10, minute: 30, status: 'completed', encounter: 'finished', reason: 'Reavaliação renal' },
      { patientKey: 'p5', serviceKey: 'consulta-exotico', professionalId: vet2, dayOffset: -10, hour: 14, minute: 0, status: 'completed', encounter: 'finished', reason: 'Penas arrepiadas e apatia' },
      { patientKey: 'p8', serviceKey: 'atendimento-campo', professionalId: vet3, dayOffset: -7, hour: 8, minute: 0, status: 'completed', encounter: 'finished', reason: 'Queda na produção de leite' },
      { patientKey: 'p2', serviceKey: 'vacinacao', professionalId: vet1, dayOffset: -5, hour: 11, minute: 0, status: 'completed', encounter: 'finished', reason: 'Vacina quádrupla felina' },
      { patientKey: 'p7', serviceKey: 'atendimento-campo', professionalId: vet3, dayOffset: -3, hour: 9, minute: 0, status: 'completed', encounter: 'finished', reason: 'Cólica leve' },
      { patientKey: 'p1', serviceKey: 'retorno', professionalId: vet1, dayOffset: 0, hour: 8, minute: 30, status: 'completed', encounter: 'finished', reason: 'Retorno da claudicação' },
      { patientKey: 'p3', serviceKey: 'consulta', professionalId: vet1, dayOffset: 0, hour: 9, minute: 30, status: 'in_service', encounter: 'in_progress', reason: 'Otite recorrente' },
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

    const encounterByAgenda = new Map<number, string>();

    for (const [index, item] of AGENDA.entries()) {
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
      encounterByAgenda.set(index, encounterId);

      await client.query(
        `UPDATE scheduling.appointments SET encounter_id = $3 WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId, encounterId],
      );

      const signedAt = finished ? iso(addMinutes(startAt, service.minutes)) : null;
      const noteStatus = finished ? 'final' : 'draft';
      const content = clinicalContent(item.patientKey, item.serviceKey);

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

        await client.query(
          `INSERT INTO billing.charge_items
             (tenant_id, facility_id, patient_id, payer_guardian_id, encounter_id, source_table, source_id,
              service_id, description, quantity, unit_price, total, status, occurred_at, created_by)
           VALUES ($1,$2,$3,$4,$5,'clinical.encounters',$5,$6,$7,1,$8,$8,'pending',$9,$10)`,
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
          ],
        );
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'subcutaneous','Região escapular',$10,$11,'completed')`,
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

    // ----------------------------------------------------------- exames
    const examCatalog = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM lab.exam_catalog WHERE tenant_id IS NULL`,
    );
    const examByCode = new Map(examCatalog.rows.map((r) => [r.code, r.id]));

    // pedido resultado: perfil renal da Nina (paciente renal crônico)
    const ninaId = patientIds.get('p4');
    const ninaEncounter = encounterByAgenda.get(1);
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
    const biduEncounter = encounterByAgenda.get(7);
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
    const betaTenantId = uuidv7();
    const betaPlan = await client.query<{ id: string }>(`SELECT id FROM platform.plans WHERE key = 'solo'`);
    await client.query(
      `INSERT INTO platform.tenants (id, slug, name, status, plan_id, settings)
       VALUES ($1,'beta','Pet Clinic Beta','active',$2,$3)`,
      [betaTenantId, betaPlan.rows[0]?.id ?? planId, JSON.stringify({ demo: true })],
    );
    for (const moduleKey of PLANS.find((p) => p.key === 'solo')?.modules ?? []) {
      await client.query(
        `INSERT INTO platform.tenant_entitlements (tenant_id, module_key, state, source)
         VALUES ($1,$2,'active','plan')`,
        [betaTenantId, moduleKey],
      );
    }

    const betaFacility = uuidv7();
    await client.query(
      `INSERT INTO platform.facilities (id, tenant_id, name, code, kind, is_default)
       VALUES ($1,$2,'Unidade Central','CEN','clinic',true)`,
      [betaFacility, betaTenantId],
    );

    const betaRoleId = uuidv7();
    const ownerTemplate = ROLE_TEMPLATES.find((r) => r.key === 'owner');
    await client.query(
      `INSERT INTO iam.roles (id, tenant_id, key, name, description, template_key, is_system, sort)
       VALUES ($1,$2,'owner','Proprietário','Acesso total.','owner',true,10)`,
      [betaRoleId, betaTenantId],
    );
    for (const permission of ownerTemplate?.permissions ?? []) {
      await client.query(
        `INSERT INTO iam.role_permissions (role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [betaRoleId, permission],
      );
    }

    const betaUserId = uuidv7();
    await client.query(
      `INSERT INTO iam.users (id, email, password_hash, name, status)
       VALUES ($1,'beta@chiron.dev',$2,'Sofia Andrade','active')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [betaUserId, passwordHash],
    );
    const betaUser = await client.query<{ id: string }>(`SELECT id FROM iam.users WHERE email = 'beta@chiron.dev'`);
    const betaFinalUserId = betaUser.rows[0]?.id ?? betaUserId;

    const betaMembershipId = uuidv7();
    await client.query(
      `INSERT INTO iam.memberships (id, tenant_id, user_id, status, is_owner, all_facilities, default_facility_id)
       VALUES ($1,$2,$3,'active',true,true,$4)`,
      [betaMembershipId, betaTenantId, betaFinalUserId, betaFacility],
    );
    await client.query(`INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id) VALUES ($1,$2,$3)`, [
      betaMembershipId,
      betaRoleId,
      betaTenantId,
    ]);

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
      betaRoleId,
      betaTenantId,
    ]);

    await client.query('COMMIT');

    console.log('');
    console.log('Seed de demonstração concluído.');
    console.log('');
    console.log(`  Tenant demo:  Clínica Veterinária Aurora (slug: demo)`);
    console.log(`  Tenant beta:  Pet Clinic Beta (slug: beta)`);
    console.log('');
    console.log('  Acessos (senha para todos: ' + DEMO_PASSWORD + ')');
    for (const user of DEMO_USERS) {
      console.log(`    ${user.email.padEnd(24)} ${user.name} (${user.roleKeys.join(', ')})`);
    }
    console.log(`    ${'beta@chiron.dev'.padEnd(24)} Sofia Andrade (outro tenant)`);
    console.log('');
    console.log(`  ${PATIENTS.length} pacientes, ${GUARDIANS.length} tutores, ${AGENDA.length} agendamentos.`);
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
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
        { code: 'respiratory_rate', value: 28, uom: 'rpm' },
        { code: 'mucous_membranes', valueCode: 'pink' },
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
          { code: 'respiratory_rate', value: 24, uom: 'rpm' },
          { code: 'body_condition_score', value: 6 },
          { code: 'pain_score', value: 2 },
          { code: 'mucous_membranes', valueCode: 'pink' },
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
          { code: 'respiratory_rate', value: 32, uom: 'rpm' },
          { code: 'systolic_bp', value: 148, uom: 'mmHg' },
          { code: 'hydration', valueCode: 'mild' },
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
                route: 'subcutaneous',
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
          { code: 'respiratory_rate', value: 60, uom: 'rpm' },
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
                route: 'intramuscular',
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
          { code: 'respiratory_rate', value: 18, uom: 'rpm' },
          { code: 'mucous_membranes', valueCode: 'pink' },
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
                route: 'intravenous',
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
          { code: 'respiratory_rate', value: 24, uom: 'rpm' },
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
          { code: 'respiratory_rate', value: 26, uom: 'rpm' },
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exit(1);
  });
