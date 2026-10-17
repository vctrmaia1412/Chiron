import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Cadastro de tutor do jeito que a recepção usa: documento conferido pelo
 * tipo e busca pelo que o tutor fala no balcão (CPF ou telefone).
 */
describe('cadastro e busca de tutor', () => {
  let client: TestClient;
  let recep: Session;
  let tenantId: string;

  async function createGuardian(payload: Record<string, unknown>) {
    return client.request({ method: 'POST', url: '/guardians', cookie: recep.cookie, tenant: tenantId, payload });
  }

  beforeAll(async () => {
    client = await createTestClient();
    recep = await client.login('recepcao@chiron.dev');
    tenantId = recep.tenantId!;
  });

  afterAll(async () => {
    await client?.close();
  });

  it('passaporte guarda letras e números', async () => {
    const response = await createGuardian({
      name: 'Tourist Smith',
      documentKind: 'passport',
      document: 'fz 123-456',
      phonePrimary: '(11) 95555-0101',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.documentKind).toBe('passport');
    expect(response.body.documentMasked).toBe('***456');
  });

  it('CPF com dígito verificador errado é recusado no campo certo', async () => {
    const response = await createGuardian({ name: 'Fulano CPF Errado', documentKind: 'cpf', document: '123.456.789-00' });
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toContain('CPF inválido');
  });

  it('número sem tipo de documento é recusado', async () => {
    const response = await createGuardian({ name: 'Fulano Sem Tipo', documentKind: 'none', document: '73481925646' });
    expect(response.status).toBe(422);
  });

  it('acha o tutor pelo CPF com máscara e pelo telefone sem máscara', async () => {
    const created = await createGuardian({
      name: 'Joana Balcão',
      documentKind: 'cpf',
      document: '734.819.256-46',
      phonePrimary: '(21) 98765-4321',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const byCpf = await client.request({
      method: 'GET',
      url: `/guardians?q=${encodeURIComponent('734.819.256-46')}`,
      cookie: recep.cookie,
      tenant: tenantId,
    });
    expect(byCpf.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);

    const byPhone = await client.request({
      method: 'GET',
      url: '/guardians?q=987654321',
      cookie: recep.cookie,
      tenant: tenantId,
    });
    expect(byPhone.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });

  it('o mesmo CPF não vira dois tutores', async () => {
    const duplicate = await createGuardian({ name: 'Joana Repetida', documentKind: 'cpf', document: '73481925646' });
    expect(duplicate.status).toBe(409);
  });
});
