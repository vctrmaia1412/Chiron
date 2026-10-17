import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Vacina e preventivo fora da consulta, contra a API real: a dose do balcão,
 * a carteira trazida pelo tutor, a correção de lote e data com auditoria e o
 * cancelamento que tira a dose das pendências sem apagar o histórico.
 */

const SENHA = 'Chiron@2026';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Data AAAA-MM-DD a `n` dias de hoje (negativo = passado). */
function day(n: number): string {
  return new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Instante ISO a `n` dias de hoje, ao meio-dia UTC para não cruzar a virada do dia. */
function at(n: number): string {
  return `${day(n)}T12:00:00.000Z`;
}

interface AuditRow {
  category: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  actor_user_id: string;
}

describe('vacinas e preventivos fora da consulta', () => {
  let client: TestClient;
  let owner: Client;
  let vet: Session;
  let tech: Session;
  let recep: Session;
  let beta: Session;
  let tenantId: string;
  let dogId: string;

  /**
   * Paciente criado direto no banco: o cadastro tem teste próprio, e aqui o
   * paciente é só o meio. Cada cenário usa o seu para que uma pendência não
   * apareça ou suma por causa de outro cenário.
   */
  async function newPatient(name: string): Promise<string> {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO registry.patients (id, tenant_id, number, name, species_id, sex, reproductive_status, status)
       VALUES (gen_random_uuid(), $1, platform.next_number($1, 'patient'), $2, $3, 'female', 'spayed', 'active')
       RETURNING id`,
      [tenantId, name, dogId],
    );
    return rows[0]!.id;
  }

  function post(session: Session, url: string, payload: unknown) {
    return client.request({ method: 'POST', url, cookie: session.cookie, tenant: session.tenantId ?? tenantId, payload });
  }

  function patch(session: Session, url: string, payload: unknown) {
    return client.request({ method: 'PATCH', url, cookie: session.cookie, tenant: session.tenantId ?? tenantId, payload });
  }

  async function dueIds(): Promise<string[]> {
    const response = await client.request({
      method: 'GET',
      url: `/immunizations/due?until=${day(60)}&limit=500`,
      cookie: vet.cookie,
      tenant: tenantId,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.items.map((item: { id: string }) => item.id);
  }

  async function auditOf(entityId: string, action: string): Promise<AuditRow[]> {
    const { rows } = await owner.query<AuditRow>(
      `SELECT category, action, before, after, reason, actor_user_id FROM audit.audit_log
        WHERE tenant_id = $1 AND entity_id = $2 AND action = $3
        ORDER BY occurred_at`,
      [tenantId, entityId, action],
    );
    return rows;
  }

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    tech = await client.login('tecnico@chiron.dev');
    recep = await client.login('recepcao@chiron.dev');
    beta = await client.login('beta@chiron.dev', SENHA, 'beta');
    tenantId = vet.tenantId!;

    owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await owner.connect();

    const species = await owner.query<{ id: string }>(`SELECT id FROM registry.species WHERE code = 'dog'`);
    dogId = species.rows[0]!.id;
  });

  afterAll(async () => {
    await owner?.end();
    await client?.close();
  });

  describe('registro sem atendimento', () => {
    it('o técnico aplica a vacina no balcão e ela já vira pendência da próxima dose', async () => {
      const patientId = await newPatient('Balcão');

      const applied = await post(tech, '/immunizations', {
        patientId,
        vaccineName: 'Antirrábica',
        manufacturer: 'Fabricante Teste',
        lotNumber: 'AR-2026-01',
        doseNumber: 1,
        nextDueAt: day(20),
      });
      expect(applied.status, JSON.stringify(applied.body)).toBe(201);
      expect(applied.body).toMatchObject({
        patientId,
        encounterId: null,
        vaccineName: 'Antirrábica',
        lotNumber: 'AR-2026-01',
        status: 'completed',
        administeredElsewhere: false,
        cancelReason: null,
      });

      const list = await client.request({
        method: 'GET',
        url: `/immunizations?patientId=${patientId}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(list.status).toBe(200);
      expect(list.body.immunizations.map((i: { id: string }) => i.id)).toEqual([applied.body.id]);

      expect(await dueIds()).toContain(applied.body.id);

      const [audit] = await auditOf(applied.body.id, 'immunization.apply');
      expect(audit?.actor_user_id).toBe(tech.userId);
      expect(audit?.after).toMatchObject({ patientId, encounterId: null, administeredElsewhere: false });
    });

    it('a recepção registra o vermífugo vendido no balcão', async () => {
      const patientId = await newPatient('Vermífugo');

      const recorded = await post(recep, '/immunizations/preventives', {
        patientId,
        kind: 'deworming',
        productName: 'Vermífugo Teste',
        doseText: '1 comprimido',
        nextDueAt: day(15),
      });
      expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
      expect(recorded.body).toMatchObject({
        patientId,
        encounterId: null,
        kind: 'deworming',
        status: 'completed',
        administeredElsewhere: false,
      });

      const due = await client.request({
        method: 'GET',
        url: `/immunizations/due?until=${day(60)}&limit=500`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      const item = due.body.items.find((i: { id: string }) => i.id === recorded.body.id);
      expect(item).toMatchObject({ kind: 'preventive', preventiveKind: 'deworming', productName: 'Vermífugo Teste' });
    });
  });

  describe('dose aplicada em outro local', () => {
    it('entra como histórico, sem profissional da casa nem lote, e com a data da carteira', async () => {
      const patientId = await newPatient('Carteira');

      const recorded = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'V10 de outra clínica',
        administeredElsewhere: true,
        administeredAt: at(-340),
        externalLocation: 'Clínica do Bairro',
        externalProfessional: 'Dra. Fulana',
        nextDueAt: day(25),
      });
      expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
      expect(recorded.body).toMatchObject({
        encounterId: null,
        administeredElsewhere: true,
        externalLocation: 'Clínica do Bairro',
        externalProfessional: 'Dra. Fulana',
        professionalName: null,
        lotNumber: null,
        nextDueAt: day(25),
      });
      expect(recorded.body.administeredAt.slice(0, 10)).toBe(day(-340));

      // A próxima dose que veio na carteira passa a ser lembrada aqui.
      expect(await dueIds()).toContain(recorded.body.id);

      // O preventivo também aceita histórico.
      const preventive = await post(recep, '/immunizations/preventives', {
        patientId,
        kind: 'ectoparasite',
        productName: 'Antipulgas Teste',
        administeredElsewhere: true,
        administeredAt: at(-20),
        externalLocation: 'Pet shop',
      });
      expect(preventive.status, JSON.stringify(preventive.body)).toBe(201);
      expect(preventive.body).toMatchObject({ administeredElsewhere: true, externalLocation: 'Pet shop', professionalName: null });
    });

    it('exige a data da aplicação, recusa data futura e não aceita vínculo com atendimento', async () => {
      const patientId = await newPatient('Carteira incompleta');

      const withoutDate = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'V10',
        administeredElsewhere: true,
      });
      expect(withoutDate.status).toBe(422);
      expect(withoutDate.body.message).toMatch(/data/i);

      const future = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'V10',
        administeredElsewhere: true,
        administeredAt: at(5),
      });
      expect(future.status).toBe(422);

      const withEncounter = await post(vet, '/immunizations', {
        patientId,
        encounterId: '0190a2b4-0000-7000-8000-000000000000',
        vaccineName: 'V10',
        administeredElsewhere: true,
        administeredAt: at(-10),
      });
      expect(withEncounter.status).toBe(422);

      const list = await client.request({
        method: 'GET',
        url: `/immunizations?patientId=${patientId}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(list.body.immunizations).toEqual([]);
    });
  });

  describe('corrigir', () => {
    it('corrige lote, data e próxima dose e grava antes e depois na auditoria', async () => {
      const patientId = await newPatient('Correção');
      const applied = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'Giárdia',
        lotNumber: 'LOTE-ERRADO',
        nextDueAt: day(30),
      });
      expect(applied.status, JSON.stringify(applied.body)).toBe(201);
      const id = applied.body.id as string;

      const corrected = await patch(vet, `/immunizations/${id}`, {
        lotNumber: 'GI-2026-07',
        administeredAt: at(-1),
        nextDueAt: day(40),
        reactionNotes: 'Sem reação.',
      });
      expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
      expect(corrected.body).toMatchObject({
        lotNumber: 'GI-2026-07',
        nextDueAt: day(40),
        reactionNotes: 'Sem reação.',
        status: 'completed',
      });
      expect(corrected.body.administeredAt.slice(0, 10)).toBe(day(-1));

      const audits = await auditOf(id, 'immunization.update');
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actor_user_id).toBe(vet.userId);
      expect(audits[0]?.before).toMatchObject({ lotNumber: 'LOTE-ERRADO', nextDueAt: day(30) });
      expect(audits[0]?.after).toMatchObject({ lotNumber: 'GI-2026-07', nextDueAt: day(40) });
      expect(audits[0]?.after?.changedFields).toEqual(
        expect.arrayContaining(['lotNumber', 'administeredAt', 'nextDueAt', 'reactionNotes']),
      );
      // Texto livre não vai em claro para a auditoria: só o nome do campo.
      expect(audits[0]?.after).not.toHaveProperty('reactionNotes');

      // Repetir a mesma correção não muda nada e não gera auditoria nova.
      const same = await patch(vet, `/immunizations/${id}`, { lotNumber: 'GI-2026-07', nextDueAt: day(40) });
      expect(same.status).toBe(200);
      expect(await auditOf(id, 'immunization.update')).toHaveLength(1);

      // `null` apaga: a vacina sem reforço deixa de gerar pendência.
      expect(await dueIds()).toContain(id);
      const cleared = await patch(vet, `/immunizations/${id}`, { nextDueAt: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.nextDueAt).toBeNull();
      expect(await dueIds()).not.toContain(id);
    });

    it('recusa próxima dose anterior à aplicação e data de aplicação no futuro', async () => {
      const patientId = await newPatient('Datas');
      const applied = await post(vet, '/immunizations', { patientId, vaccineName: 'Leish', nextDueAt: day(30) });
      const id = applied.body.id as string;

      const before = await patch(vet, `/immunizations/${id}`, { nextDueAt: day(-10) });
      expect(before.status).toBe(422);
      const future = await patch(vet, `/immunizations/${id}`, { administeredAt: at(3) });
      expect(future.status).toBe(422);
      expect(await auditOf(id, 'immunization.update')).toHaveLength(0);
    });

    it('corrige o preventivo com a mesma regra', async () => {
      const patientId = await newPatient('Correção preventivo');
      const recorded = await post(vet, '/immunizations/preventives', {
        patientId,
        kind: 'ectoparasite',
        productName: 'Coleira Teste',
        nextDueAt: day(10),
      });
      const id = recorded.body.id as string;

      const corrected = await patch(vet, `/immunizations/preventives/${id}`, {
        lotNumber: 'CL-01',
        doseText: '1 coleira',
        nextDueAt: day(90),
      });
      expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
      expect(corrected.body).toMatchObject({ lotNumber: 'CL-01', doseText: '1 coleira', nextDueAt: day(90) });

      const [audit] = await auditOf(id, 'preventive.update');
      expect(audit?.before).toMatchObject({ lotNumber: null, nextDueAt: day(10) });
      expect(audit?.after).toMatchObject({ lotNumber: 'CL-01', nextDueAt: day(90) });
    });
  });

  describe('cancelar', () => {
    it('cancelar a vacina exige motivo, mantém o histórico e tira a dose das pendências', async () => {
      const patientId = await newPatient('Cancelamento');
      const applied = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'Gripe canina',
        nextDueAt: day(12),
      });
      const id = applied.body.id as string;
      expect(await dueIds()).toContain(id);

      const noReason = await post(vet, `/immunizations/${id}/cancel`, { reason: '' });
      expect(noReason.status).toBe(422);

      const cancelled = await post(vet, `/immunizations/${id}/cancel`, { reason: 'Registrado no paciente errado' });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(201);
      expect(cancelled.body).toMatchObject({
        status: 'entered_in_error',
        cancelReason: 'Registrado no paciente errado',
        // O motivo tem campo próprio: não se mistura à reação observada.
        reactionNotes: null,
      });
      expect(cancelled.body.cancelledAt).toBeTruthy();

      expect(await dueIds()).not.toContain(id);

      // Continua no histórico, marcado como cancelado.
      const list = await client.request({
        method: 'GET',
        url: `/immunizations?patientId=${patientId}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(list.body.immunizations).toHaveLength(1);
      expect(list.body.immunizations[0].status).toBe('entered_in_error');

      const [audit] = await auditOf(id, 'immunization.cancel');
      expect(audit).toMatchObject({ category: 'cancel', reason: 'Registrado no paciente errado' });
      expect(audit?.before).toMatchObject({ status: 'completed', nextDueAt: day(12) });
      expect(audit?.after).toMatchObject({ status: 'entered_in_error' });

      const again = await post(vet, `/immunizations/${id}/cancel`, { reason: 'De novo' });
      expect(again.status).toBe(409);
      const edit = await patch(vet, `/immunizations/${id}`, { lotNumber: 'X' });
      expect(edit.status).toBe(409);
    });

    it('cancelar a dose mais recente devolve a pendência da anterior', async () => {
      const patientId = await newPatient('Reforço errado');
      const first = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'Tosse dos canis',
        administeredElsewhere: true,
        administeredAt: at(-360),
        nextDueAt: day(5),
      });
      const second = await post(vet, '/immunizations', {
        patientId,
        vaccineName: 'Tosse dos canis',
        nextDueAt: day(360),
      });
      // A dose de hoje quita a pendência da carteira.
      expect(await dueIds()).not.toContain(first.body.id);

      const cancelled = await post(vet, `/immunizations/${second.body.id}/cancel`, { reason: 'Dose não aplicada' });
      expect(cancelled.status).toBe(201);
      expect(await dueIds()).toContain(first.body.id);
    });

    it('cancelar a vacina cancela a cobrança ainda pendente dela', async () => {
      const patientId = await newPatient('Cobrança');
      const applied = await post(vet, '/immunizations', { patientId, vaccineName: 'Antirrábica cobrada' });
      const id = applied.body.id as string;

      // Item como o gerado na finalização do atendimento.
      const facility = await owner.query<{ id: string }>(
        `SELECT id FROM platform.facilities WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
        [tenantId],
      );
      const charge = await owner.query<{ id: string }>(
        `INSERT INTO billing.charge_items (tenant_id, facility_id, patient_id, source_table, source_id, description)
         VALUES ($1, $2, $3, 'immunization.immunizations', $4, 'Vacina: Antirrábica cobrada')
         RETURNING id`,
        [tenantId, facility.rows[0]!.id, patientId, id],
      );

      const cancelled = await post(vet, `/immunizations/${id}/cancel`, { reason: 'Registro duplicado' });
      expect(cancelled.status).toBe(201);

      const after = await owner.query<{ status: string }>(`SELECT status FROM billing.charge_items WHERE id = $1`, [
        charge.rows[0]!.id,
      ]);
      expect(after.rows[0]?.status).toBe('cancelled');
    });

    it('cancelar o preventivo tira a próxima aplicação das pendências', async () => {
      const patientId = await newPatient('Preventivo cancelado');
      const recorded = await post(recep, '/immunizations/preventives', {
        patientId,
        kind: 'deworming',
        productName: 'Vermífugo cancelado',
        nextDueAt: day(8),
      });
      const id = recorded.body.id as string;
      expect(await dueIds()).toContain(id);

      const cancelled = await post(vet, `/immunizations/preventives/${id}/cancel`, { reason: 'Produto não entregue' });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(201);
      expect(cancelled.body).toMatchObject({ status: 'entered_in_error', cancelReason: 'Produto não entregue' });
      expect(await dueIds()).not.toContain(id);

      const [audit] = await auditOf(id, 'preventive.cancel');
      expect(audit).toMatchObject({ category: 'cancel', reason: 'Produto não entregue' });
    });
  });

  describe('permissões', () => {
    let vaccineId: string;
    let preventiveId: string;

    beforeAll(async () => {
      const patientId = await newPatient('Permissões');
      const vaccine = await post(vet, '/immunizations', { patientId, vaccineName: 'V8', nextDueAt: day(30) });
      vaccineId = vaccine.body.id;
      const preventive = await post(recep, '/immunizations/preventives', {
        patientId,
        kind: 'deworming',
        productName: 'Vermífugo da recepção',
      });
      preventiveId = preventive.body.id;
    });

    it('a recepção registra preventivo, mas não aplica vacina', async () => {
      const patientId = await newPatient('Recepção sem vacina');
      const denied = await post(recep, '/immunizations', { patientId, vaccineName: 'V8' });
      expect(denied.status).toBe(403);
    });

    it('o técnico aplica, mas não corrige nem cancela', async () => {
      expect((await patch(tech, `/immunizations/${vaccineId}`, { lotNumber: 'X' })).status).toBe(403);
      expect((await post(tech, `/immunizations/${vaccineId}/cancel`, { reason: 'Tentativa' })).status).toBe(403);
      expect((await patch(tech, `/immunizations/preventives/${preventiveId}`, { doseText: 'X' })).status).toBe(403);
    });

    it('a recepção não cancela nem o preventivo que ela mesma registrou', async () => {
      const denied = await post(recep, `/immunizations/preventives/${preventiveId}/cancel`, { reason: 'Engano' });
      expect(denied.status).toBe(403);

      const still = await client.request({
        method: 'GET',
        url: `/immunizations/preventives/${preventiveId}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(still.body.status).toBe('completed');
    });

    it('outra organização não enxerga nem corrige o registro', async () => {
      const response = await client.request({
        method: 'PATCH',
        url: `/immunizations/${vaccineId}`,
        cookie: beta.cookie,
        payload: { lotNumber: 'INVASOR' },
      });
      expect(response.status).toBe(404);

      const cancel = await client.request({
        method: 'POST',
        url: `/immunizations/${vaccineId}/cancel`,
        cookie: beta.cookie,
        payload: { reason: 'Invasão' },
      });
      expect(cancel.status).toBe(404);

      const own = await client.request({
        method: 'GET',
        url: `/immunizations/${vaccineId}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(own.body).toMatchObject({ lotNumber: null, status: 'completed' });
    });
  });
});
