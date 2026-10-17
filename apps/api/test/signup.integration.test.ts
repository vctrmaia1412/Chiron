import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type TestClient } from './helpers/app';

/**
 * Cadastro aberto do piloto: o veterinário cria a conta e a clínica, entra na
 * hora e já consegue agendar, sem enxergar nada da demonstração.
 */
describe('criar conta e clínica', () => {
  let client: TestClient;
  let ipCounter = 0;

  /** Cada teste vem de um IP próprio: o freio por hora não vaza entre eles. */
  function nextIp(): string {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`;
  }

  function signup(payload: Record<string, unknown>, ip = nextIp()) {
    return client.request({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        name: 'Dra. Ana Piloto',
        password: 'senha-do-piloto-2026',
        clinicName: 'Clínica Piloto São Francisco',
        city: 'Campinas',
        state: 'SP',
        isVeterinarian: true,
        councilNumber: '98765',
        councilState: 'SP',
        acceptTerms: true,
        ...payload,
      },
      headers: { 'x-forwarded-for': ip },
    });
  }

  beforeAll(async () => {
    client = await createTestClient();
  });

  afterAll(async () => {
    await client?.close();
  });

  it('cria a clínica, entra direto e já tem serviços para agendar', async () => {
    const created = await signup({ email: 'ana.piloto@exemplo.dev' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.cookie).toBeTruthy();
    expect(created.body.activeTenantId).toBeTruthy();
    const tenantId = created.body.activeTenantId as string;
    const cookie = created.cookie!;

    const me = await client.request({ method: 'GET', url: '/me/context', cookie });
    expect(me.body.tenant.name).toBe('Clínica Piloto São Francisco');
    expect(me.body.tenant.slug).toMatch(/^clinica-piloto-sao-francisco-[a-z0-9]{4}$/);
    expect(me.body.membership.professionalId).toBeTruthy();
    expect(me.body.permissions).toContain('encounter:sign');

    const services = await client.request({ method: 'GET', url: '/services', cookie, tenant: tenantId });
    const keys = (services.body.items as Array<{ key: string; defaultPrice: string | null }>).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['consulta', 'retorno', 'vacinacao']));
    expect(services.body.items.every((s: { defaultPrice: string | null }) => s.defaultPrice === null)).toBe(true);

    // clínica nova não enxerga a demonstração
    const patients = await client.request({ method: 'GET', url: '/patients', cookie, tenant: tenantId });
    expect(patients.body.items).toHaveLength(0);

    // e consegue trabalhar: paciente novo e consulta marcada com o serviço inicial
    const species = await client.request({ method: 'GET', url: '/species', cookie, tenant: tenantId });
    const dog = species.body.items.find((s: { code: string }) => s.code === 'dog').id;
    const patient = await client.request({
      method: 'POST',
      url: '/patients',
      cookie,
      tenant: tenantId,
      payload: {
        name: 'Primeiro Paciente',
        speciesId: dog,
        sex: 'male',
        reproductiveStatus: 'intact',
        newGuardian: { personType: 'individual', name: 'Primeiro Tutor', phonePrimary: '(19) 99999-0000' },
      },
    });
    expect(patient.status, JSON.stringify(patient.body)).toBe(201);
    const consulta = services.body.items.find((s: { key: string }) => s.key === 'consulta').id;
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const appointment = await client.request({
      method: 'POST',
      url: '/appointments',
      cookie,
      tenant: tenantId,
      payload: {
        patientId: patient.body.id,
        professionalId: me.body.membership.professionalId,
        serviceId: consulta,
        startAt: start.toISOString(),
      },
    });
    expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);
  });

  it('quem não é veterinário cria sem CRMV e entra sem registro profissional', async () => {
    const created = await signup({
      email: 'gestor.piloto@exemplo.dev',
      name: 'Carlos Gestor',
      isVeterinarian: false,
      councilNumber: undefined,
      councilState: undefined,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const me = await client.request({ method: 'GET', url: '/me/context', cookie: created.cookie });
    expect(me.body.membership.professionalId).toBeNull();
  });

  it('veterinário sem CRMV recebe o erro no campo', async () => {
    const response = await signup({ email: 'sem.crmv@exemplo.dev', councilNumber: undefined, councilState: undefined });
    expect(response.status).toBe(422);
    const paths = (response.body.details.issues as Array<{ path: string }>).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['councilNumber', 'councilState']));
  });

  it('e-mail que já tem conta não vira segunda conta', async () => {
    const response = await signup({ email: 'vet@chiron.dev' });
    expect(response.status).toBe(409);
    expect(response.body.details.reason).toBe('email_taken');
  });

  it('sem aceitar as condições do piloto não cria', async () => {
    const response = await signup({ email: 'sem.aceite@exemplo.dev', acceptTerms: false });
    expect(response.status).toBe(422);
  });

  it('robô que preenche o campo invisível não cria nada', async () => {
    const response = await signup({ email: 'robo@exemplo.dev', website: 'http://spam.example' });
    expect(response.status).toBe(422);
    const login = await client.request({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'robo@exemplo.dev', password: 'senha-do-piloto-2026' },
    });
    expect(login.status).toBe(401);
  });

  it('a mesma rede não cria clínicas sem parar', async () => {
    const ip = '198.51.100.77';
    for (let index = 0; index < 5; index += 1) {
      const created = await signup({ email: `lote${index}@exemplo.dev`, isVeterinarian: false }, ip);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    }
    const blocked = await signup({ email: 'lote-extra@exemplo.dev', isVeterinarian: false }, ip);
    expect(blocked.status).toBe(429);
  });
});
