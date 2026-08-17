import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Itens de cobrança gerados na finalização do atendimento.
 *
 * Este é o contrato que o parceiro de faturamento consome e que a recepção usa
 * no check-out: descrição, quantidade, preço, total, pagador, unidade e origem
 * de cada item. O caminho clínico é o mesmo de clinical-flow (cadastro, agenda,
 * check-in, atendimento, finalização); aqui ele é o meio, e o resultado
 * financeiro é o alvo.
 */

/** Formato devolvido por GET /encounters/:id/charges. */
interface ChargeItemResponse {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string | null;
  total: string | null;
  status: string;
  origin: string;
  occurredAt: string;
}

/** Linha crua de billing.charge_items: pagador, unidade e origem não saem na rota. */
interface ChargeItemRow {
  id: string;
  tenant_id: string;
  facility_id: string;
  patient_id: string | null;
  payer_guardian_id: string | null;
  service_id: string | null;
  source_table: string | null;
  source_id: string | null;
  description: string;
  quantity: string;
  unit_price: string | null;
  total: string | null;
  status: string;
}

interface CatalogService {
  id: string;
  key: string;
  name: string;
  defaultPrice: string | null;
}

const SENHA = 'Chiron@2026';
const VACINA = 'Antirrábica';
const PROCEDIMENTO = 'Drenagem de abscesso em região cervical';

describe('cobrança do atendimento finalizado', () => {
  let client: TestClient;
  let owner: Client;

  let vet: Session;
  let admin: Session;
  let tecnico: Session;
  let beta: Session;

  let tenantId: string;
  let facilityId: string;
  let patientId: string;
  let guardianId: string;
  let encounterId: string;
  let immunizationId: string;

  let consulta: CatalogService;
  let procedimento: CatalogService;

  async function chargeRows(): Promise<ChargeItemRow[]> {
    const { rows } = await owner.query<ChargeItemRow>(
      `SELECT id, tenant_id, facility_id, patient_id, payer_guardian_id, service_id,
              source_table, source_id, description, quantity::text AS quantity,
              unit_price::text AS unit_price, total::text AS total, status
         FROM billing.charge_items
        WHERE encounter_id = $1
        ORDER BY description`,
      [encounterId],
    );
    return rows;
  }

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    admin = await client.login('admin@chiron.dev');
    tecnico = await client.login('tecnico@chiron.dev');
    beta = await client.login('beta@chiron.dev', SENHA, 'beta');
    tenantId = vet.tenantId ?? '';

    owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await owner.connect();

    const species = await client.request({ method: 'GET', url: '/species', cookie: vet.cookie });
    const speciesId = species.body.items.find((s: { code: string }) => s.code === 'dog').id;

    const services = await client.request({ method: 'GET', url: '/services', cookie: vet.cookie });
    consulta = services.body.items.find((s: CatalogService) => s.key === 'consulta');
    procedimento = services.body.items.find((s: CatalogService) => s.key === 'procedimento');

    const me = await client.request({ method: 'GET', url: '/me/context', cookie: vet.cookie });
    const professionalId = me.body.membership.professionalId;

    // Paciente novo: o atendimento precisa nascer sem nenhum item de cobrança
    // anterior para que a idempotência signifique alguma coisa.
    const patient = await client.request({
      method: 'POST',
      url: '/patients',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        name: 'Pilha',
        speciesId,
        sex: 'female',
        newGuardian: { personType: 'individual', name: 'Tutor da Cobrança', documentKind: 'none' },
      },
    });
    expect(patient.status, JSON.stringify(patient.body)).toBe(201);
    patientId = patient.body.id;

    const detail = await client.request({ method: 'GET', url: `/patients/${patientId}`, cookie: vet.cookie });
    guardianId = detail.body.guardians[0].guardianId;

    // A primeira hora do dia seguinte fica livre na agenda semeada, e o fluxo
    // clínico já ocupa as 9h: 8h é o horário que não colide com nada.
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);

    const appointment = await client.request({
      method: 'POST',
      url: '/appointments',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId,
        guardianId,
        professionalId,
        serviceId: consulta.id,
        startAt: start.toISOString(),
        reason: 'Abscesso e reforço vacinal',
      },
    });
    expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);

    const checkIn = await client.request({
      method: 'POST',
      url: `/appointments/${appointment.body.id}/check-in`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { weightKg: 12.4, weightUom: 'kg' },
    });
    expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(201);
    encounterId = checkIn.body.encounterId ?? checkIn.body.encounter?.id;

    await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/start`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });

    const note = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/notes`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { kind: 'assessment', body: 'Abscesso drenado, sem sinais sistêmicos.' },
    });
    expect(note.status, JSON.stringify(note.body)).toBe(201);

    const procedure = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/procedures`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { description: PROCEDIMENTO, serviceId: procedimento.id },
    });
    expect(procedure.status, JSON.stringify(procedure.body)).toBe(201);

    const immunization = await client.request({
      method: 'POST',
      url: '/immunizations',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { patientId, encounterId, vaccineName: VACINA, route: 'sc', doseNumber: 1 },
    });
    expect(immunization.status, JSON.stringify(immunization.body)).toBe(201);
    immunizationId = immunization.body.id;

    const catalog = await client.request({ method: 'GET', url: '/exam-catalog', cookie: vet.cookie });
    const cbc = catalog.body.items.find((e: { code: string }) => e.code === 'CBC');

    const examOrder = await client.request({
      method: 'POST',
      url: '/exam-orders',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId,
        encounterId,
        priority: 'routine',
        clinicalInfo: 'Avaliar leucograma antes do reforço.',
        items: [{ examCatalogId: cbc.id }],
      },
    });
    expect(examOrder.status, JSON.stringify(examOrder.body)).toBe(201);

    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    facilityId = encounter.body.facilityId;

    const finish = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/finish`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { disposition: 'discharged' },
    });
    expect(finish.status, JSON.stringify(finish.body)).toBe(201);
    expect(finish.body.status).toBe('finished');
  });

  afterAll(async () => {
    await client?.close();
    await owner?.end();
  });

  it('1. o serviço do atendimento vira item pendente com o preço do catálogo', async () => {
    const charges = await client.request({
      method: 'GET',
      url: `/encounters/${encounterId}/charges`,
      cookie: vet.cookie,
    });
    expect(charges.status, JSON.stringify(charges.body)).toBe(200);

    const items = charges.body.items as ChargeItemResponse[];
    const item = items.find((i) => i.description === consulta.name);
    if (!item) throw new Error(`Nenhum item de cobrança para o serviço ${consulta.name}.`);

    expect(item.status).toBe('pending');
    expect(item.origin).toBe('clinical.encounters');
    expect(Number(item.quantity)).toBe(1);
    expect(Number(item.unitPrice)).toBe(Number(consulta.defaultPrice));
    expect(Number(item.total)).toBe(Number(consulta.defaultPrice));
    expect(item.occurredAt).toBeTruthy();
  });

  it('2. todo item nasce com o tutor principal como pagador e na unidade do atendimento', async () => {
    const rows = await chargeRows();
    expect(rows.length).toBeGreaterThanOrEqual(4);

    for (const row of rows) {
      expect(row.tenant_id).toBe(tenantId);
      expect(row.patient_id, `${row.description} ficou sem paciente`).toBe(patientId);
      expect(row.payer_guardian_id, `${row.description} ficou sem tutor pagador`).toBe(guardianId);
      expect(row.facility_id, `${row.description} ficou em outra unidade`).toBe(facilityId);
      expect(row.status).toBe('pending');
    }

    const servico = rows.find((r) => r.source_table === 'clinical.encounters');
    expect(servico?.service_id).toBe(consulta.id);
    expect(servico?.source_id).toBe(encounterId);
  });

  it('3. procedimento, vacina e exame viram itens com origem rastreável', async () => {
    const rows = await chargeRows();
    const bySource = new Map<string, ChargeItemRow>();
    for (const row of rows) {
      if (row.source_table) bySource.set(row.source_table, row);
    }

    const procedureRow = await owner.query<{ id: string }>(
      `SELECT id FROM clinical.encounter_procedures WHERE tenant_id = $1 AND encounter_id = $2`,
      [tenantId, encounterId],
    );
    const examRow = await owner.query<{ id: string; name: string }>(
      `SELECT i.id, ec.name
         FROM lab.exam_order_items i
         JOIN lab.exam_orders o ON o.id = i.exam_order_id AND o.tenant_id = i.tenant_id
         JOIN lab.exam_catalog ec ON ec.id = i.exam_catalog_id
        WHERE i.tenant_id = $1 AND o.encounter_id = $2`,
      [tenantId, encounterId],
    );

    const procedimentoItem = bySource.get('clinical.encounter_procedures');
    expect(procedimentoItem?.description).toBe(PROCEDIMENTO);
    expect(procedimentoItem?.source_id).toBe(procedureRow.rows[0]?.id);
    expect(procedimentoItem?.service_id).toBe(procedimento.id);
    expect(Number(procedimentoItem?.unit_price)).toBe(Number(procedimento.defaultPrice));

    const vacinaItem = bySource.get('immunization.immunizations');
    expect(vacinaItem?.description).toBe(`Vacina: ${VACINA}`);
    expect(vacinaItem?.source_id).toBe(immunizationId);
    // Vacina e exame ainda entram sem preço: o catálogo de preços por produto
    // não existe, e o item serve como lembrete de cobrança para a recepção.
    expect(vacinaItem?.unit_price).toBeNull();
    expect(vacinaItem?.total).toBeNull();

    const exameItem = bySource.get('lab.exam_order_items');
    expect(exameItem?.description).toBe(`Exame: ${examRow.rows[0]?.name}`);
    expect(exameItem?.source_id).toBe(examRow.rows[0]?.id);
    expect(exameItem?.unit_price).toBeNull();
  });

  it('4. reabrir e finalizar de novo não duplica cobrança', async () => {
    const before = await chargeRows();

    const stepUp = await client.request({
      method: 'POST',
      url: '/auth/step-up',
      cookie: admin.cookie,
      payload: { password: SENHA },
    });
    expect(stepUp.status, JSON.stringify(stepUp.body)).toBe(201);

    const reopen = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/reopen`,
      cookie: admin.cookie,
      tenant: tenantId,
      payload: { reason: 'Conferência do resumo de cobrança com o tutor' },
    });
    expect(reopen.status, JSON.stringify(reopen.body)).toBe(201);
    expect(reopen.body.status).toBe('in_progress');

    const finish = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/finish`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { disposition: 'discharged' },
    });
    expect(finish.status, JSON.stringify(finish.body)).toBe(201);

    // A idempotência é por atendimento: existindo qualquer item, a geração
    // inteira é pulada. Nada é criado de novo e nada é reescrito.
    const after = await chargeRows();
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after.map((r) => r.description)).toEqual(before.map((r) => r.description));
  });

  it('5. o item de cobrança não aparece para outra organização', async () => {
    const response = await client.request({
      method: 'GET',
      url: `/encounters/${encounterId}/charges`,
      cookie: beta.cookie,
    });
    // A rota consulta sempre dentro do tenant da sessão: o atendimento é de
    // outra organização, então não existe item algum a mostrar.
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('6. quitar externamente muda só os pendentes e devolve a contagem', async () => {
    const rows = await chargeRows();
    const vacina = rows.find((r) => r.source_table === 'immunization.immunizations');
    if (!vacina) throw new Error('O item da vacina deveria existir antes da quitação.');

    // Um item fora da conta prova que a quitação não passa por cima de quem já
    // não estava pendente.
    await owner.query(`UPDATE billing.charge_items SET status = 'cancelled' WHERE id = $1`, [vacina.id]);
    const pendentes = rows.length - 1;

    const settle = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/charges/settle-externally`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });
    expect(settle.status, JSON.stringify(settle.body)).toBe(201);
    expect(settle.body.settled).toBe(pendentes);

    for (const row of await chargeRows()) {
      expect(row.status, row.description).toBe(row.id === vacina.id ? 'cancelled' : 'settled_externally');
    }

    const again = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/charges/settle-externally`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });
    expect(again.body.settled).toBe(0);

    const list = await client.request({
      method: 'GET',
      url: `/encounters/${encounterId}/charges`,
      cookie: vet.cookie,
    });
    const items = list.body.items as ChargeItemResponse[];
    expect(items.map((i) => i.id)).not.toContain(vacina.id);
    expect(items.every((i) => i.status === 'settled_externally')).toBe(true);
  });

  it('7. sem a permissão de cobrança não se lê nem se quita', async () => {
    const read = await client.request({
      method: 'GET',
      url: `/encounters/${encounterId}/charges`,
      cookie: tecnico.cookie,
    });
    expect(read.status).toBe(403);
    expect(read.body.code).toBe('FORBIDDEN');
    expect(read.body.details?.permission).toBe('charge:read');

    const settle = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/charges/settle-externally`,
      cookie: tecnico.cookie,
      tenant: tenantId,
      payload: {},
    });
    expect(settle.status).toBe(403);
    expect(settle.body.code).toBe('FORBIDDEN');
  });
});
