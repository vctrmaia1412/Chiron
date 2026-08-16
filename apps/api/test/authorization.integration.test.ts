import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Autorização pela API: isolamento entre organizações visto de fora,
 * permissões por papel, entitlement de módulo e confirmação de tenant.
 * O banco já foi coberto em tenant-isolation; aqui o alvo é a borda HTTP.
 */
describe('autorização e isolamento pela API', () => {
  let client: TestClient;
  let vet: Session;
  let beta: Session;
  let reception: Session;
  let owner: Session;

  let demoPatientId: string;
  let betaPatientId: string;
  let demoEncounterId: string;
  let demoTenantId: string;
  let betaTenantId: string;

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    beta = await client.login('beta@chiron.dev', 'Chiron@2026', 'beta');
    reception = await client.login('recepcao@chiron.dev');
    owner = await client.login('admin@chiron.dev', 'Chiron@2026', 'demo');

    demoTenantId = vet.tenantId!;
    betaTenantId = beta.tenantId!;

    const demoPatients = await client.request({ method: 'GET', url: '/patients?limit=1', cookie: vet.cookie });
    demoPatientId = demoPatients.body.items[0].id;

    const betaPatients = await client.request({ method: 'GET', url: '/patients?limit=1', cookie: beta.cookie });
    betaPatientId = betaPatients.body.items[0].id;

    const encounters = await client.request({ method: 'GET', url: '/encounters?limit=1', cookie: vet.cookie });
    demoEncounterId = encounters.body.items[0].id;
  });

  afterAll(async () => {
    await client?.close();
  });

  describe('sessão', () => {
    it('nega acesso sem sessão', async () => {
      const response = await client.request({ method: 'GET', url: '/patients' });
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('nega acesso com cookie inválido', async () => {
      const response = await client.request({
        method: 'GET',
        url: '/patients',
        cookie: 'chiron_session=token-que-nao-existe',
      });
      expect(response.status).toBe(401);
    });

    it('encerra a sessão no logout', async () => {
      const temp = await client.login('tecnico@chiron.dev');
      const before = await client.request({ method: 'GET', url: '/me/context', cookie: temp.cookie });
      expect(before.status).toBe(200);

      await client.request({ method: 'POST', url: '/auth/logout', cookie: temp.cookie, payload: {} });

      const after = await client.request({ method: 'GET', url: '/me/context', cookie: temp.cookie });
      expect(after.status).toBe(401);
    });

    it('não revela se o e-mail existe em credencial inválida', async () => {
      const inexistente = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ninguem@chiron.dev', password: 'Chiron@2026' },
      });
      const senhaErrada = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'vet@chiron.dev', password: 'senha-errada-1234' },
      });
      expect(inexistente.status).toBe(senhaErrada.status);
      expect(inexistente.body.message).toBe(senhaErrada.body.message);
    });
  });

  describe('isolamento entre organizações na borda HTTP', () => {
    it('o usuário do tenant A não lê paciente do tenant B', async () => {
      const response = await client.request({
        method: 'GET',
        url: `/patients/${betaPatientId}`,
        cookie: vet.cookie,
      });
      expect(response.status).toBe(404);
    });

    it('o usuário do tenant B não lê paciente do tenant A', async () => {
      const response = await client.request({
        method: 'GET',
        url: `/patients/${demoPatientId}`,
        cookie: beta.cookie,
      });
      expect(response.status).toBe(404);
    });

    it('o usuário do tenant B não lê atendimento do tenant A', async () => {
      const response = await client.request({
        method: 'GET',
        url: `/encounters/${demoEncounterId}`,
        cookie: beta.cookie,
      });
      expect(response.status).toBe(404);
    });

    it('o usuário do tenant B não lê o prontuário do paciente do tenant A', async () => {
      const response = await client.request({
        method: 'GET',
        url: `/patients/${demoPatientId}/record`,
        cookie: beta.cookie,
      });
      expect(response.status).toBe(404);
    });

    it('a listagem só devolve dados da própria organização', async () => {
      const demo = await client.request({ method: 'GET', url: '/patients?limit=100', cookie: vet.cookie });
      const other = await client.request({ method: 'GET', url: '/patients?limit=100', cookie: beta.cookie });

      const demoIds = new Set(demo.body.items.map((p: { id: string }) => p.id));
      const otherIds = new Set(other.body.items.map((p: { id: string }) => p.id));

      expect(demoIds.size).toBeGreaterThan(0);
      expect(otherIds.size).toBeGreaterThan(0);
      for (const id of otherIds) expect(demoIds.has(id)).toBe(false);
    });

    it('a busca global não atravessa organizações', async () => {
      const response = await client.request({ method: 'GET', url: '/search?q=Thor', cookie: beta.cookie });
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
    });

    it('não é possível alterar paciente de outra organização', async () => {
      const response = await client.request({
        method: 'PATCH',
        url: `/patients/${demoPatientId}`,
        cookie: beta.cookie,
        tenant: betaTenantId,
        payload: { name: 'Invadido' },
      });
      expect(response.status).toBe(404);
    });

    it('o tenant informado pelo cliente não é autoridade: header divergente é recusado', async () => {
      const response = await client.request({
        method: 'POST',
        url: '/patients',
        cookie: vet.cookie,
        tenant: betaTenantId,
        payload: { name: 'Tentativa', speciesId: '00000000-0000-0000-0000-000000000000' },
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CONTEXT_MISMATCH');
    });

    it('trocar de organização muda o que a sessão enxerga', async () => {
      const switched = await client.request({
        method: 'POST',
        url: '/me/context',
        cookie: owner.cookie,
        payload: { tenantId: betaTenantId },
      });
      expect(switched.status).toBeLessThan(400);
      const cookie = switched.cookie ?? owner.cookie;

      const patients = await client.request({ method: 'GET', url: '/patients?limit=100', cookie });
      const ids = patients.body.items.map((p: { id: string }) => p.id);
      expect(ids).toContain(betaPatientId);
      expect(ids).not.toContain(demoPatientId);

      // volta para a organização original
      const back = await client.request({
        method: 'POST',
        url: '/me/context',
        cookie,
        payload: { tenantId: demoTenantId },
      });
      owner = { ...owner, cookie: back.cookie ?? cookie, tenantId: demoTenantId };
    });

    it('não é possível entrar em organização da qual não se participa', async () => {
      const response = await client.request({
        method: 'POST',
        url: '/me/context',
        cookie: vet.cookie,
        payload: { tenantId: betaTenantId },
      });
      expect(response.status).toBe(403);
    });
  });

  describe('permissões por papel', () => {
    it('a recepção não abre o prontuário completo', async () => {
      const response = await client.request({
        method: 'GET',
        url: `/patients/${demoPatientId}/record`,
        cookie: reception.cookie,
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('a recepção não emite receita', async () => {
      const response = await client.request({
        method: 'POST',
        url: '/prescriptions',
        cookie: reception.cookie,
        tenant: demoTenantId,
        payload: { patientId: demoPatientId, items: [{ drugName: 'Teste' }] },
      });
      expect(response.status).toBe(403);
    });

    it('a recepção consulta a agenda, que é o trabalho dela', async () => {
      const response = await client.request({ method: 'GET', url: '/appointments', cookie: reception.cookie });
      expect(response.status).toBe(200);
    });

    it('o veterinário não consulta a auditoria', async () => {
      const response = await client.request({ method: 'GET', url: '/audit', cookie: vet.cookie });
      expect(response.status).toBe(403);
      expect(response.body.details?.permission).toBe('audit:read');
    });

    it('o proprietário consulta a auditoria', async () => {
      const response = await client.request({ method: 'GET', url: '/audit?limit=5', cookie: owner.cookie });
      expect(response.status).toBe(200);
    });

    it('a negativa de acesso fica registrada na auditoria', async () => {
      await client.request({ method: 'GET', url: '/audit', cookie: vet.cookie });
      const response = await client.request({
        method: 'GET',
        url: '/audit?category=access_denied&limit=5',
        cookie: owner.cookie,
      });
      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('entitlement de módulo', () => {
    let ownerDb: Client;

    beforeAll(async () => {
      ownerDb = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
      await ownerDb.connect();
    });

    afterAll(async () => {
      await ownerDb.query(
        `UPDATE platform.tenant_entitlements SET state = 'active'
          WHERE tenant_id = $1 AND module_key = 'lab'`,
        [demoTenantId],
      );
      await ownerDb.end();
    });

    it('módulo desligado bloqueia a rota mesmo com permissão', async () => {
      const before = await client.request({ method: 'GET', url: '/exam-orders?limit=1', cookie: vet.cookie });
      expect(before.status).toBe(200);

      await ownerDb.query(
        `UPDATE platform.tenant_entitlements SET state = 'disabled'
          WHERE tenant_id = $1 AND module_key = 'lab'`,
        [demoTenantId],
      );

      const after = await client.request({ method: 'GET', url: '/exam-orders?limit=1', cookie: vet.cookie });
      expect(after.status).toBe(403);
      expect(after.body.code).toBe('MODULE_NOT_ENABLED');
    });

    it('módulo suspenso permite leitura e bloqueia escrita', async () => {
      await ownerDb.query(
        `UPDATE platform.tenant_entitlements SET state = 'suspended'
          WHERE tenant_id = $1 AND module_key = 'lab'`,
        [demoTenantId],
      );

      const read = await client.request({ method: 'GET', url: '/exam-orders?limit=1', cookie: vet.cookie });
      expect(read.status).toBe(200);

      const write = await client.request({
        method: 'POST',
        url: '/exam-orders',
        cookie: vet.cookie,
        tenant: demoTenantId,
        payload: {
          patientId: demoPatientId,
          items: [{ examCatalogId: '00000000-0000-0000-0000-000000000000' }],
        },
      });
      expect(write.status).toBe(403);
      expect(write.body.code).toBe('MODULE_SUSPENDED');
    });
  });

  describe('validação de entrada', () => {
    it('recusa corpo fora do contrato', async () => {
      const response = await client.request({
        method: 'POST',
        url: '/patients',
        cookie: vet.cookie,
        tenant: demoTenantId,
        payload: { nome: 'errado' },
      });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.details.issues.length).toBeGreaterThan(0);
    });

    it('recusa identificador que não é uuid', async () => {
      const response = await client.request({
        method: 'GET',
        url: '/patients/nao-e-uuid',
        cookie: vet.cookie,
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it('toda resposta traz o id da requisição para rastreio', async () => {
      const response = await client.request({ method: 'GET', url: '/patients', cookie: vet.cookie });
      expect(response.headers['x-request-id']).toBeTruthy();
    });
  });
});
