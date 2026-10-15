import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Agenda do dia a dia contra a API real: remarcar, cancelar depois do
 * check-in e o plantão em que outro veterinário assume o atendimento.
 */
describe('agenda e plantão', () => {
  let client: TestClient;
  let vet: Session;
  let vet2: Session;
  let tech: Session;
  let tenantId: string;
  let serviceId: string;
  let professionalId: string;
  let professional2Id: string;
  let patientId: string;

  /** Um dia longe dos outros testes, para não disputar horário. */
  function at(daysAhead: number, hour: number, minute = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  async function book(startAt: string, extra: Record<string, unknown> = {}) {
    const response = await client.request({
      method: 'POST',
      url: '/appointments',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { patientId, professionalId, serviceId, startAt, ...extra },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; startAt: string; endAt: string; version: number };
  }

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    vet2 = await client.login('vet2@chiron.dev');
    tech = await client.login('tecnico@chiron.dev');
    tenantId = vet.tenantId!;

    const species = await client.request({ method: 'GET', url: '/species', cookie: vet.cookie });
    const dog = species.body.items.find((s: { code: string }) => s.code === 'dog').id;
    const services = await client.request({ method: 'GET', url: '/services', cookie: vet.cookie });
    serviceId = services.body.items.find((s: { key: string }) => s.key === 'consulta').id;

    const me = await client.request({ method: 'GET', url: '/me/context', cookie: vet.cookie });
    professionalId = me.body.membership.professionalId;
    const me2 = await client.request({ method: 'GET', url: '/me/context', cookie: vet2.cookie });
    professional2Id = me2.body.membership.professionalId;

    const patient = await client.request({
      method: 'POST',
      url: '/patients',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        name: 'Pipoca',
        speciesId: dog,
        sex: 'female',
        reproductiveStatus: 'spayed',
        weightKg: 6.2,
        newGuardian: { personType: 'individual', name: 'Tutor da Pipoca', phonePrimary: '(11) 97777-1234' },
      },
    });
    expect(patient.status, JSON.stringify(patient.body)).toBe(201);
    patientId = patient.body.id;
  });

  afterAll(async () => {
    await client?.close();
  });

  it('remarcar mantém a duração e recalcula o fim', async () => {
    const original = await book(at(30, 9));
    const duration = new Date(original.endAt).getTime() - new Date(original.startAt).getTime();

    const response = await client.request({
      method: 'PATCH',
      url: `/appointments/${original.id}`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { startAt: at(31, 14), expectedVersion: original.version },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(new Date(response.body.startAt).toISOString()).toBe(at(31, 14));
    expect(new Date(response.body.endAt).getTime() - new Date(response.body.startAt).getTime()).toBe(duration);
  });

  it('remarcar para cima de outro horário do mesmo profissional é recusado, e o encaixe explícito passa', async () => {
    await book(at(32, 10));
    const other = await book(at(32, 15));

    const clash = await client.request({
      method: 'PATCH',
      url: `/appointments/${other.id}`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { startAt: at(32, 10, 10) },
    });
    expect(clash.status).toBe(409);

    const squeezed = await client.request({
      method: 'PATCH',
      url: `/appointments/${other.id}`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { startAt: at(32, 10, 10), allowOverlap: true },
    });
    expect(squeezed.status, JSON.stringify(squeezed.body)).toBe(200);
  });

  it('versão desatualizada não sobrescreve a remarcação de outra pessoa', async () => {
    const appointment = await book(at(33, 9));
    const stale = await client.request({
      method: 'PATCH',
      url: `/appointments/${appointment.id}`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { startAt: at(33, 11), expectedVersion: appointment.version - 1 },
    });
    expect(stale.status).toBe(409);
  });

  it('cancelar depois do check-in cancela junto o atendimento que não começou', async () => {
    const appointment = await book(at(34, 9));
    const checkIn = await client.request({
      method: 'POST',
      url: `/appointments/${appointment.id}/check-in`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });
    expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(201);
    const encounterId = checkIn.body.encounterId;

    const cancel = await client.request({
      method: 'POST',
      url: `/appointments/${appointment.id}/cancel`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { reason: 'Tutor precisou ir embora' },
    });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(201);
    expect(cancel.body.status).toBe('cancelled');

    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    expect(encounter.body.status).toBe('cancelled');
  });

  it('cancelar pela agenda um atendimento já iniciado é recusado', async () => {
    const appointment = await book(at(35, 9));
    const checkIn = await client.request({
      method: 'POST',
      url: `/appointments/${appointment.id}/check-in`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });
    await client.request({
      method: 'POST',
      url: `/encounters/${checkIn.body.encounterId}/start`,
      cookie: vet.cookie,
      tenant: tenantId,
    });

    const cancel = await client.request({
      method: 'POST',
      url: `/appointments/${appointment.id}/cancel`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { reason: 'Tentativa indevida' },
    });
    expect(cancel.status).toBe(409);
  });

  it('a fila separa quem aguarda de quem está em atendimento', async () => {
    const waiting = await client.request({
      method: 'POST',
      url: '/encounters',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { patientId, class: 'outpatient', chiefComplaint: 'Aguardando' },
    });
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(201);

    const list = async (stage: string) => {
      const response = await client.request({
        method: 'GET',
        url: `/encounters?stage=${stage}&patientId=${patientId}&limit=50`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return (response.body.items as Array<{ id: string; status: string }>);
    };

    const waitingList = await list('waiting');
    expect(waitingList.map((item) => item.id)).toContain(waiting.body.id);
    expect(waitingList.every((item) => ['arrived', 'triaged'].includes(item.status))).toBe(true);

    await client.request({ method: 'POST', url: `/encounters/${waiting.body.id}/start`, cookie: vet.cookie, tenant: tenantId });
    await client.request({ method: 'POST', url: `/encounters/${waiting.body.id}/hold`, cookie: vet.cookie, tenant: tenantId });

    const activeList = await list('active');
    expect(activeList.find((item) => item.id === waiting.body.id)?.status).toBe('on_hold');
    expect((await list('waiting')).map((item) => item.id)).not.toContain(waiting.body.id);
  });

  it('técnico que inicia o atendimento não vira o responsável', async () => {
    const created = await client.request({
      method: 'POST',
      url: '/encounters',
      cookie: tech.cookie,
      tenant: tenantId,
      payload: { patientId, class: 'outpatient', chiefComplaint: 'Triagem pelo técnico' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const started = await client.request({
      method: 'POST',
      url: `/encounters/${created.body.id}/start`,
      cookie: tech.cookie,
      tenant: tenantId,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.attendingProfessional).toBeNull();
  });

  it('veterinário de plantão assume o atendimento de outro e fica na auditoria', async () => {
    const created = await client.request({
      method: 'POST',
      url: '/encounters',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { patientId, class: 'outpatient', chiefComplaint: 'Plantão' },
    });
    expect(created.body.attendingProfessional.id).toBe(professionalId);

    const denied = await client.request({
      method: 'POST',
      url: `/encounters/${created.body.id}/assume`,
      cookie: tech.cookie,
      tenant: tenantId,
    });
    expect(denied.status).toBe(403);

    const assumed = await client.request({
      method: 'POST',
      url: `/encounters/${created.body.id}/assume`,
      cookie: vet2.cookie,
      tenant: tenantId,
    });
    expect(assumed.status, JSON.stringify(assumed.body)).toBe(201);
    expect(assumed.body.attendingProfessional.id).toBe(professional2Id);
  });
});
