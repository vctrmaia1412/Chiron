import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Trazer a equipe sem beco sem saída: convite de técnico sem CRMV, de
 * veterinário com CRMV obrigatório, lista de pendentes, reenvio que troca o
 * link de propósito, revogação que derruba o link na hora e a prévia pública
 * que a tela de aceite usa para dizer o que está acontecendo.
 */

const SENHA = 'Chiron@2026';

interface Convite {
  id: string;
  token: string;
}

describe('convites da equipe', () => {
  let client: TestClient;
  /** Conexão de dono: é por ela que o teste vence o prazo de um convite. */
  let ownerDb: Client;
  let owner: Session;
  let betaOwner: Session;
  let recepcao: Session;

  beforeAll(async () => {
    client = await createTestClient();
    ownerDb = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await ownerDb.connect();

    owner = await client.login('admin@chiron.dev', SENHA, 'demo');
    betaOwner = await client.login('beta@chiron.dev', SENHA, 'beta');
    recepcao = await client.login('recepcao@chiron.dev', SENHA, 'demo');
  });

  afterAll(async () => {
    await client?.close();
    await ownerDb?.end();
  });

  // ------------------------------------------------------------- utilidades

  /** O link só volta na resposta em dev e test; em produção ele vai por e-mail. */
  function tokenDoLink(inviteUrl: unknown): string {
    if (typeof inviteUrl !== 'string') throw new Error('O convite não devolveu o link de aceite.');
    const marca = '/convite/';
    const corte = inviteUrl.indexOf(marca);
    if (corte < 0) throw new Error(`Link de convite fora do formato esperado: ${inviteUrl}`);
    return decodeURIComponent(inviteUrl.slice(corte + marca.length));
  }

  async function convidar(payload: Record<string, unknown>, session: Session = owner) {
    return client.request({ method: 'POST', url: '/members/invite', cookie: session.cookie, payload });
  }

  async function convidarOk(payload: Record<string, unknown>): Promise<Convite> {
    const resposta = await convidar(payload);
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
    return { id: resposta.body.id, token: tokenDoLink(resposta.body.inviteUrl) };
  }

  async function previa(token: string) {
    return client.request({ method: 'GET', url: `/auth/invitations/${encodeURIComponent(token)}` });
  }

  async function aceitar(token: string, payload: { name?: string; password?: string } = {}) {
    return client.request({ method: 'POST', url: '/auth/invitations/accept', payload: { token, ...payload } });
  }

  async function pendentes(session: Session = owner) {
    const resposta = await client.request({ method: 'GET', url: '/members/invitations', cookie: session.cookie });
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
    return resposta.body.items as Array<{
      id: string;
      email: string;
      name: string | null;
      role: { key: string; name: string };
      invitedByName: string | null;
      sentAt: string;
      expiresAt: string;
      status: 'pending' | 'expired';
    }>;
  }

  async function reenviar(id: string, session: Session = owner) {
    return client.request({ method: 'POST', url: `/members/invitations/${id}/resend`, cookie: session.cookie });
  }

  async function revogar(id: string, session: Session = owner) {
    return client.request({ method: 'DELETE', url: `/members/invitations/${id}`, cookie: session.cookie });
  }

  // ------------------------------------------------- papel e registro (CRMV)

  describe('papel e registro profissional', () => {
    it('a lista de papéis diz quem exige CRMV: veterinário sim, técnico e recepção não', async () => {
      const resposta = await client.request({ method: 'GET', url: '/roles', cookie: owner.cookie });
      expect(resposta.status).toBe(200);

      const porChave = new Map(
        (resposta.body.items as Array<{ key: string; requiresLicense: boolean; id: string; permissionCount: number }>).map(
          (role) => [role.key, role],
        ),
      );
      expect(porChave.get('veterinarian')?.requiresLicense).toBe(true);
      expect(porChave.get('technician')?.requiresLicense).toBe(false);
      expect(porChave.get('receptionist')?.requiresLicense).toBe(false);
      // A tela de papéis usa o id e o total de permissões.
      expect(typeof porChave.get('technician')?.id).toBe('string');
      expect(porChave.get('technician')?.permissionCount).toBeGreaterThan(0);
    });

    it('técnico é convidado sem CRMV', async () => {
      const resposta = await convidar({ email: 'cv.tecnica@chiron.dev', name: 'Técnica Convidada', roleKey: 'technician' });
      expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
      expect(typeof resposta.body.id).toBe('string');
      // A tela confirma para quem foi e até quando vale, mesmo sem o link.
      expect(resposta.body.email).toBe('cv.tecnica@chiron.dev');
      expect(new Date(resposta.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(String(resposta.body.inviteUrl)).toContain('/convite/');
    });

    it('recepção é convidada sem CRMV', async () => {
      const resposta = await convidar({ email: 'cv.recepcao@chiron.dev', roleKey: 'receptionist' });
      expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
    });

    it('veterinário sem CRMV é recusado com erro por campo', async () => {
      const resposta = await convidar({ email: 'cv.vet.sem.crmv@chiron.dev', name: 'Vet Sem Registro', roleKey: 'veterinarian' });
      expect(resposta.status).toBe(422);
      expect(resposta.body.code).toBe('VALIDATION_FAILED');
      const caminhos = (resposta.body.details.issues as Array<{ path: string }>).map((issue) => issue.path);
      expect(caminhos).toEqual(expect.arrayContaining(['professional.councilNumber', 'professional.councilState']));

      // Nada foi gravado: a recusa vem antes do convite existir.
      const linhas = await ownerDb.query(`SELECT 1 FROM iam.invitations WHERE email = $1`, ['cv.vet.sem.crmv@chiron.dev']);
      expect(linhas.rowCount).toBe(0);
    });

    it('veterinário com número mas sem UF também é recusado', async () => {
      const resposta = await convidar({
        email: 'cv.vet.sem.uf@chiron.dev',
        roleKey: 'veterinarian',
        professional: { councilNumber: '77001', councilState: '' },
      });
      expect(resposta.status).toBe(422);
      const caminhos = (resposta.body.details.issues as Array<{ path: string }>).map((issue) => issue.path);
      expect(caminhos).toContain('professional.councilState');
      expect(caminhos).not.toContain('professional.councilNumber');
    });

    it('veterinário com CRMV entra e já vira profissional com registro', async () => {
      const convite = await convidarOk({
        email: 'cv.vet@chiron.dev',
        name: 'Vet Convidada',
        roleKey: 'veterinarian',
        professional: { councilNumber: '77002', councilState: 'mg' },
      });

      const aceite = await aceitar(convite.token, { name: 'Vet Convidada', password: SENHA });
      expect(aceite.status, JSON.stringify(aceite.body)).toBeLessThan(400);

      const membros = await client.request({ method: 'GET', url: '/members', cookie: owner.cookie });
      const vet = membros.body.items.find((m: { email: string }) => m.email === 'cv.vet@chiron.dev');
      expect(vet.professional.councilNumber).toBe('77002');
      expect(vet.professional.councilState).toBe('MG');
      expect(vet.professional.isLicensed).toBe(true);
    });

    it('CRMV que já é de outro profissional da clínica é recusado no convite, não no aceite', async () => {
      const membros = await client.request({ method: 'GET', url: '/members', cookie: owner.cookie });
      const existente = membros.body.items.find((m: { email: string }) => m.email === 'vet@chiron.dev');
      expect(existente?.professional?.councilNumber).toBeTruthy();

      const resposta = await convidar({
        email: 'cv.vet.duplicado@chiron.dev',
        roleKey: 'veterinarian',
        professional: {
          councilNumber: existente.professional.councilNumber,
          councilState: existente.professional.councilState,
        },
      });
      expect(resposta.status).toBe(409);
      expect(resposta.body.code).toBe('CONFLICT');
    });
  });

  // ------------------------------------------------------- lista e reconvite

  describe('convites pendentes', () => {
    let convite: Convite;
    const email = 'cv.pendente@chiron.dev';

    beforeAll(async () => {
      convite = await convidarOk({ email, name: 'Pessoa Pendente', roleKey: 'technician' });
    });

    it('aparecem na lista com papel, envio e validade', async () => {
      const lista = await pendentes();
      const item = lista.find((i) => i.id === convite.id);
      expect(item).toBeTruthy();
      expect(item?.email).toBe(email);
      expect(item?.name).toBe('Pessoa Pendente');
      expect(item?.role.key).toBe('technician');
      expect(item?.status).toBe('pending');
      expect(item?.invitedByName).toBeTruthy();
      expect(new Date(item?.expiresAt ?? 0).getTime()).toBeGreaterThan(new Date(item?.sentAt ?? 0).getTime());
    });

    it('convidar de novo não troca o link em silêncio: 409 apontando o convite pendente', async () => {
      const resposta = await convidar({ email, roleKey: 'receptionist' });
      expect(resposta.status).toBe(409);
      expect(resposta.body.code).toBe('CONFLICT');
      expect(resposta.body.details.reason).toBe('invitation_pending');
      expect(resposta.body.details.invitationId).toBe(convite.id);

      // O link que a pessoa já recebeu continua valendo, com o papel original.
      const ainda = await previa(convite.token);
      expect(ainda.status).toBe(200);
      expect(ainda.body.status).toBe('pending');
      const item = (await pendentes()).find((i) => i.id === convite.id);
      expect(item?.role.key).toBe('technician');
    });

    it('quem não convida não vê a lista', async () => {
      const resposta = await client.request({ method: 'GET', url: '/members/invitations', cookie: recepcao.cookie });
      expect(resposta.status).toBe(403);
      expect(resposta.body.details?.permission).toBe('member:invite');
    });

    it('outra organização não vê, não reenvia e não revoga', async () => {
      const listaBeta = await pendentes(betaOwner);
      expect(listaBeta.some((i) => i.id === convite.id)).toBe(false);

      const reenvio = await reenviar(convite.id, betaOwner);
      expect(reenvio.status).toBe(404);
      const revogacao = await revogar(convite.id, betaOwner);
      expect(revogacao.status).toBe(404);

      const intacto = await previa(convite.token);
      expect(intacto.body.status).toBe('pending');
    });

    it('id fora do formato é convite inexistente', async () => {
      const resposta = await reenviar('nao-e-um-uuid');
      expect(resposta.status).toBe(404);
    });
  });

  // ----------------------------------------------------------------- reenvio

  describe('reenviar', () => {
    it('troca o token: o link antigo para de valer e o novo aceita', async () => {
      const original = await convidarOk({ email: 'cv.reenvio@chiron.dev', name: 'Pessoa Reenvio', roleKey: 'receptionist' });
      const antes = (await pendentes()).find((i) => i.id === original.id);

      const resposta = await reenviar(original.id);
      expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
      expect(resposta.body.id).toBe(original.id);
      expect(resposta.body.email).toBe('cv.reenvio@chiron.dev');
      const novoToken = tokenDoLink(resposta.body.inviteUrl);
      expect(novoToken).not.toBe(original.token);

      const depois = (await pendentes()).find((i) => i.id === original.id);
      expect(new Date(depois?.sentAt ?? 0).getTime()).toBeGreaterThanOrEqual(new Date(antes?.sentAt ?? 0).getTime());

      // O link antigo não existe mais: nem prévia, nem aceite.
      const previaAntiga = await previa(original.token);
      expect(previaAntiga.status).toBe(404);
      const aceiteAntigo = await aceitar(original.token, { name: 'Pessoa Reenvio', password: SENHA });
      expect(aceiteAntigo.status).toBe(422);
      expect(aceiteAntigo.cookie).toBeUndefined();

      const previaNova = await previa(novoToken);
      expect(previaNova.status).toBe(200);
      expect(previaNova.body.status).toBe('pending');

      const aceite = await aceitar(novoToken, { name: 'Pessoa Reenvio', password: SENHA });
      expect(aceite.status, JSON.stringify(aceite.body)).toBeLessThan(400);
      expect(aceite.cookie).toBeTruthy();

      // Aceito: sai da lista, a prévia diz que já foi usado e não reenvia mais.
      expect((await pendentes()).some((i) => i.id === original.id)).toBe(false);
      const usado = await previa(novoToken);
      expect(usado.body.status).toBe('accepted');
      const reenvioAceito = await reenviar(original.id);
      expect(reenvioAceito.status).toBe(409);
    });

    it('fica na auditoria', async () => {
      const auditoria = await client.request({
        method: 'GET',
        url: '/audit?action=member.invite.resend&limit=5',
        cookie: owner.cookie,
      });
      expect(auditoria.status).toBe(200);
      expect(auditoria.body.items.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------- revogar

  describe('revogar', () => {
    let convite: Convite;
    const email = 'cv.revogado@chiron.dev';

    beforeAll(async () => {
      convite = await convidarOk({ email, name: 'Pessoa Revogada', roleKey: 'technician' });
    });

    it('derruba o link: a prévia diz revogado e o aceite falha', async () => {
      const resposta = await revogar(convite.id);
      expect(resposta.status).toBe(200);
      expect(resposta.body.ok).toBe(true);

      const situacao = await previa(convite.token);
      expect(situacao.status).toBe(200);
      expect(situacao.body.status).toBe('revoked');

      const aceite = await aceitar(convite.token, { name: 'Pessoa Revogada', password: SENHA });
      expect(aceite.status).toBe(422);
      expect(aceite.body.code).toBe('VALIDATION_FAILED');
      expect(aceite.body.details.reason).toBe('revoked');
      expect(aceite.cookie).toBeUndefined();

      const conta = await ownerDb.query(`SELECT 1 FROM iam.users WHERE email = $1`, [email]);
      expect(conta.rowCount).toBe(0);
    });

    it('sai da lista, não reenvia e revogar de novo não é erro', async () => {
      expect((await pendentes()).some((i) => i.id === convite.id)).toBe(false);

      const reenvio = await reenviar(convite.id);
      expect(reenvio.status).toBe(409);

      const deNovo = await revogar(convite.id);
      expect(deNovo.status).toBe(200);
    });

    it('depois de revogar dá para convidar o mesmo e-mail de novo', async () => {
      const novo = await convidarOk({ email, name: 'Pessoa Revogada', roleKey: 'receptionist' });
      expect(novo.id).not.toBe(convite.id);
      const situacao = await previa(novo.token);
      expect(situacao.body.status).toBe('pending');
      expect(situacao.body.roleName).toBe('Recepção');
    });

    it('fica na auditoria', async () => {
      const auditoria = await client.request({
        method: 'GET',
        url: '/audit?action=member.invite.revoke&limit=5',
        cookie: owner.cookie,
      });
      expect(auditoria.status).toBe(200);
      expect(auditoria.body.items.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------ vencimento

  describe('convite vencido', () => {
    let convite: Convite;
    const email = 'cv.vencido@chiron.dev';

    beforeAll(async () => {
      convite = await convidarOk({ email, name: 'Pessoa Vencida', roleKey: 'technician' });
      await ownerDb.query(`UPDATE iam.invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
        convite.id,
      ]);
    });

    it('a prévia diz vencido, o aceite falha e a lista marca para reenviar', async () => {
      const situacao = await previa(convite.token);
      expect(situacao.body.status).toBe('expired');

      const aceite = await aceitar(convite.token, { name: 'Pessoa Vencida', password: SENHA });
      expect(aceite.status).toBe(422);
      expect(aceite.body.details.reason).toBe('expired');

      const item = (await pendentes()).find((i) => i.id === convite.id);
      expect(item?.status).toBe('expired');
    });

    it('convidar de novo um vencido não é conflito: o link velho já não abria nada', async () => {
      const resposta = await convidar({ email, name: 'Pessoa Vencida', roleKey: 'receptionist' });
      expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
      expect(resposta.body.id).toBe(convite.id);

      const novoToken = tokenDoLink(resposta.body.inviteUrl);
      const situacao = await previa(novoToken);
      expect(situacao.body.status).toBe('pending');
      expect(situacao.body.roleName).toBe('Recepção');
    });
  });

  // -------------------------------------------------------- prévia pública

  describe('prévia do convite pelo link', () => {
    it('mostra clínica, papel, quem convidou e validade, sem o e-mail inteiro', async () => {
      const convite = await convidarOk({ email: 'cv.previa@chiron.dev', name: 'Pessoa Prévia', roleKey: 'technician' });
      const contexto = await client.request({ method: 'GET', url: '/me/context', cookie: owner.cookie });

      // Rota pública: sem cookie nenhum.
      const resposta = await previa(convite.token);
      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('pending');
      expect(resposta.body.organizationName).toBe(contexto.body.tenant.name);
      expect(resposta.body.roleName).toBe('Técnico / Enfermagem');
      expect(resposta.body.invitedByName).toBe(contexto.body.user.name);
      expect(resposta.body.name).toBe('Pessoa Prévia');
      expect(resposta.body.hasAccount).toBe(false);
      expect(new Date(resposta.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(resposta.body.emailMasked).toContain('@chiron.dev');
      expect(resposta.body.emailMasked).not.toContain('cv.previa');
      // Nada de identificador interno nem do hash do token.
      expect(JSON.stringify(resposta.body)).not.toContain(convite.id);
      expect(resposta.body.tenantId).toBeUndefined();
    });

    it('avisa quando o e-mail já tem conta, para pedir a senha atual em vez de criar outra', async () => {
      // Dona do tenant beta convidada para o demo: a conta existe, com senha.
      const convite = await convidarOk({ email: 'beta@chiron.dev', roleKey: 'receptionist' });
      const resposta = await previa(convite.token);
      expect(resposta.body.status).toBe('pending');
      expect(resposta.body.hasAccount).toBe(true);

      // Não aceita: a conta de seed não pode ganhar um segundo tenant aqui.
      expect((await revogar(convite.id)).status).toBe(200);
    });

    it('token desconhecido é 404', async () => {
      const resposta = await previa('c'.repeat(43));
      expect(resposta.status).toBe(404);
      expect(resposta.body.code).toBe('NOT_FOUND');
    });

    it('token curto demais também é 404, sem ir ao banco', async () => {
      const resposta = await previa('curto');
      expect(resposta.status).toBe(404);
    });
  });
});
