import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { Client } from 'pg';
import { createTestClient, type Session, type TestClient } from './helpers/app';
import { IdentityService } from '../src/modules/identity/identity.service';

/**
 * Identidade pela borda HTTP: entrada na conta, bloqueio por tentativas,
 * redefinição de senha, convite, aceite e reautenticação. São os fluxos que a
 * clínica percorre na primeira semana e os que seguram abuso, então cada um
 * vem com o caminho que funciona e o caminho que precisa falhar.
 */

/** Senha dos usuários de seed e das contas criadas por esta suíte. */
const SENHA = 'Chiron@2026';

/** Espelha MAX_FAILED_ATTEMPTS de identity.service.ts. */
const MAX_TENTATIVAS = 8;

interface Membro {
  email: string;
  cookie: string;
  userId: string;
  membershipId: string;
}

describe('identidade pela API', () => {
  let client: TestClient;
  /** Conexão de dono: é por ela que se destrava conta e se retroage auth_time. */
  let ownerDb: Client;
  /** Papel da aplicação, com RLS ativo: confere o isolamento dos convites. */
  let appDb: Client;

  let owner: Session;
  let betaOwner: Session;
  let demoTenantId: string;
  let betaTenantId: string;
  /** Membro comum do tenant demo, alvo das edições protegidas por step-up. */
  let membro: Membro;

  beforeAll(async () => {
    client = await createTestClient();

    ownerDb = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await ownerDb.connect();
    appDb = new Client({ connectionString: process.env.DATABASE_URL });
    await appDb.connect();

    owner = await client.login('admin@chiron.dev', SENHA, 'demo');
    betaOwner = await client.login('beta@chiron.dev', SENHA, 'beta');
    demoTenantId = owner.tenantId ?? '';
    betaTenantId = betaOwner.tenantId ?? '';

    membro = await criarMembro('membro.comum@chiron.dev', 'Membro Comum', 'receptionist');
  });

  afterAll(async () => {
    await client?.close();
    await ownerDb?.end();
    await appDb?.end();
  });

  // ------------------------------------------------------------- utilidades

  /**
   * O link de aceite só volta na resposta em dev e test. Em produção ele sai
   * por e-mail, e é por isso que o teste precisa desmontar a URL aqui.
   */
  function tokenDoConvite(inviteUrl: unknown): string {
    if (typeof inviteUrl !== 'string') throw new Error('O convite não devolveu o link de aceite.');
    const marca = '/convite/';
    const corte = inviteUrl.indexOf(marca);
    if (corte < 0) throw new Error(`Link de convite fora do formato esperado: ${inviteUrl}`);
    return decodeURIComponent(inviteUrl.slice(corte + marca.length));
  }

  /**
   * O banco guarda o HMAC do token de sessão, nunca o token. Para alcançar a
   * linha da sessão o teste refaz a mesma conta do SessionService.
   */
  function idDaSessao(cookie: string): string {
    const token = cookie.slice(cookie.indexOf('=') + 1);
    return createHmac('sha256', process.env.SESSION_SECRET ?? '')
      .update(token)
      .digest('hex');
  }

  /** Alias de tipo, não interface: o genérico de `pg` exige índice inferível. */
  type ContaRow = {
    id: string;
    failed_login_attempts: number;
    locked_until: Date | null;
  };

  async function contaDe(email: string): Promise<ContaRow> {
    const { rows } = await ownerDb.query<ContaRow>(
      `SELECT id, failed_login_attempts, locked_until FROM iam.users WHERE email = $1`,
      [email],
    );
    const conta = rows[0];
    if (!conta) throw new Error(`A conta ${email} não existe no banco de teste.`);
    return conta;
  }

  /** Zera o bloqueio pela conexão de dono, que é o que a operação faria na mão. */
  async function destravarConta(email: string): Promise<void> {
    await ownerDb.query(`UPDATE iam.users SET failed_login_attempts = 0, locked_until = NULL WHERE email = $1`, [
      email,
    ]);
  }

  /** Empurra a reautenticação da sessão para fora da janela de step-up. */
  async function envelhecerSessao(cookie: string): Promise<void> {
    const { rowCount } = await ownerDb.query(
      `UPDATE iam.sessions SET auth_time = now() - interval '2 hours' WHERE id = $1`,
      [idDaSessao(cookie)],
    );
    if (rowCount !== 1) throw new Error('Sessão não encontrada para retroagir auth_time.');
  }

  async function convidar(
    session: Session,
    payload: { email: string; name?: string; roleKey: string },
  ): Promise<{ id: string; token: string }> {
    const resposta = await client.request({
      method: 'POST',
      url: '/members/invite',
      cookie: session.cookie,
      payload,
    });
    expect(resposta.status).toBeLessThan(400);
    return { id: resposta.body.id, token: tokenDoConvite(resposta.body.inviteUrl) };
  }

  async function aceitar(token: string, payload: { name?: string; password?: string } = {}) {
    return client.request({ method: 'POST', url: '/auth/invitations/accept', payload: { token, ...payload } });
  }

  /** Convite do proprietário do demo, aceite e sessão pronta em uma tacada. */
  async function criarMembro(email: string, nome: string, roleKey: string): Promise<Membro> {
    const convite = await convidar(owner, { email, name: nome, roleKey });
    const aceite = await aceitar(convite.token, { name: nome, password: SENHA });
    expect(aceite.status).toBeLessThan(400);

    const cookie = aceite.cookie;
    if (!cookie) throw new Error(`O aceite de ${email} não devolveu cookie de sessão.`);

    const contexto = await client.request({ method: 'GET', url: '/me/context', cookie });
    expect(contexto.status).toBe(200);
    return { email, cookie, userId: contexto.body.user.id, membershipId: contexto.body.membership.id };
  }

  async function membroDaLista(email: string) {
    const lista = await client.request({ method: 'GET', url: '/members', cookie: owner.cookie });
    expect(lista.status).toBe(200);
    return lista.body.items.find((m: { email: string }) => m.email === email);
  }

  /** Lê o convite com o papel da aplicação sob um tenant escolhido (RLS ativo). */
  async function convitesVisiveis(invitationId: string, tenantId: string): Promise<number> {
    await appDb.query('BEGIN');
    try {
      await appDb.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const { rowCount } = await appDb.query(`SELECT id FROM iam.invitations WHERE id = $1`, [invitationId]);
      return rowCount ?? 0;
    } finally {
      await appDb.query('ROLLBACK');
    }
  }

  // ----------------------------------------------------------------- login

  describe('entrada na conta', () => {
    afterAll(async () => {
      // A tentativa errada do teste de resposta uniforme não pode ficar
      // contando para o bloqueio de uma conta de seed usada por outra suíte.
      await destravarConta('financeiro@chiron.dev');
    });

    it('a senha correta abre sessão já com a organização ativa', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'financeiro@chiron.dev', password: SENHA },
      });

      expect(resposta.status).toBeLessThan(400);
      expect(resposta.cookie).toBeTruthy();
      expect(resposta.body.user.email).toBe('financeiro@chiron.dev');
      expect(resposta.body.activeTenantId).toBe(demoTenantId);
      // A senha nunca volta em nenhuma forma na resposta.
      expect(JSON.stringify(resposta.body)).not.toContain(SENHA);

      const contexto = await client.request({ method: 'GET', url: '/me/context', cookie: resposta.cookie });
      expect(contexto.status).toBe(200);
      expect(contexto.body.tenant.slug).toBe('demo');
    });

    it('senha errada e e-mail inexistente devolvem exatamente a mesma resposta', async () => {
      const inexistente = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ninguem.identidade@chiron.dev', password: SENHA },
      });
      const senhaErrada = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'financeiro@chiron.dev', password: 'senha-errada-1234' },
      });

      expect(inexistente.status).toBe(401);
      expect(senhaErrada.status).toBe(401);
      expect(inexistente.body.code).toBe('INVALID_CREDENTIALS');
      expect(senhaErrada.body.code).toBe(inexistente.body.code);
      expect(senhaErrada.body.message).toBe(inexistente.body.message);
      // Nada de detalhe que separe um caso do outro, nem cookie de sessão.
      expect(inexistente.body.details).toBeUndefined();
      expect(senhaErrada.body.details).toBeUndefined();
      expect(inexistente.cookie).toBeUndefined();
      expect(senhaErrada.cookie).toBeUndefined();
      expect(senhaErrada.body.message).not.toContain('financeiro@chiron.dev');
    });

    it('conta desconhecida não vira sessão nem contexto', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ninguem.identidade@chiron.dev', password: SENHA },
      });
      expect(resposta.cookie).toBeUndefined();

      const contexto = await client.request({ method: 'GET', url: '/me/context' });
      expect(contexto.status).toBe(401);
    });
  });

  // ------------------------------------------------------ bloqueio por erro

  describe('bloqueio por tentativas', () => {
    const email = 'bloqueio.teste@chiron.dev';

    beforeAll(async () => {
      await criarMembro(email, 'Conta de Bloqueio', 'receptionist');
    });

    afterAll(async () => {
      await destravarConta(email);
    });

    it(`recusa a senha certa depois de ${MAX_TENTATIVAS} tentativas erradas`, async () => {
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
        const errada = await client.request({
          method: 'POST',
          url: '/auth/login',
          payload: { email, password: `senha-errada-${tentativa}` },
        });
        expect(errada.status).toBe(401);
        expect(errada.body.code).toBe('INVALID_CREDENTIALS');
      }

      const conta = await contaDe(email);
      expect(conta.failed_login_attempts).toBe(MAX_TENTATIVAS);
      const travadaAte = conta.locked_until;
      expect(travadaAte).not.toBeNull();
      // Bloqueio temporário: trava por minutos, não para sempre.
      expect(travadaAte?.getTime() ?? 0).toBeGreaterThan(Date.now());

      const comSenhaCerta = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: SENHA },
      });
      expect(comSenhaCerta.status).toBe(423);
      expect(comSenhaCerta.body.code).toBe('ACCOUNT_LOCKED');
      expect(comSenhaCerta.cookie).toBeUndefined();
    });

    it('destravar a conta exige mexer em iam.users pela conexão de dono', async () => {
      // Não existe rota de destravar: ou se espera o prazo, ou se redefine a
      // senha, ou alguém com a conexão de dono zera o contador na mão.
      await destravarConta(email);

      const resposta = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: SENHA },
      });
      expect(resposta.status).toBeLessThan(400);
      expect(resposta.cookie).toBeTruthy();

      const conta = await contaDe(email);
      expect(conta.failed_login_attempts).toBe(0);
      expect(conta.locked_until).toBeNull();
    });
  });

  // ------------------------------------------------------ redefinir a senha

  describe('redefinição de senha', () => {
    const email = 'reset.senha@chiron.dev';
    const novaSenha = 'NovaSenha@2026';
    let userId: string;

    beforeAll(async () => {
      const criado = await criarMembro(email, 'Conta de Redefinição', 'receptionist');
      userId = criado.userId;
    });

    /**
     * O token cru só existe no e-mail: o banco guarda apenas o hash, e a rota
     * responde `{ ok: true }` justamente para não devolver o link a quem pediu.
     * Para percorrer o fluxo, o teste pede o token ao próprio serviço.
     */
    async function pedirToken(destinatario: string): Promise<string> {
      const identidade = client.app.get(IdentityService);
      const { token } = await identidade.requestPasswordReset(destinatario);
      if (!token) throw new Error(`Nenhum token gerado para ${destinatario}.`);
      return token;
    }

    it('responde igual para e-mail cadastrado e desconhecido', async () => {
      const cadastrado = await client.request({
        method: 'POST',
        url: '/auth/password/forgot',
        payload: { email },
      });
      const desconhecido = await client.request({
        method: 'POST',
        url: '/auth/password/forgot',
        payload: { email: 'ninguem.identidade@chiron.dev' },
      });

      expect(cadastrado.status).toBeLessThan(400);
      expect(desconhecido.status).toBe(cadastrado.status);
      expect(desconhecido.body).toEqual(cadastrado.body);
      expect(cadastrado.body.ok).toBe(true);
    });

    it('o token troca a senha de fato, derruba as sessões e não serve duas vezes', async () => {
      const antes = await client.login(email, SENHA);
      const sessaoViva = await client.request({ method: 'GET', url: '/me/context', cookie: antes.cookie });
      expect(sessaoViva.status).toBe(200);

      const token = await pedirToken(email);
      const troca = await client.request({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token, password: novaSenha },
      });
      expect(troca.status).toBeLessThan(400);

      // A sessão aberta antes da troca deixa de valer.
      const depois = await client.request({ method: 'GET', url: '/me/context', cookie: antes.cookie });
      expect(depois.status).toBe(401);

      const senhaAntiga = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: SENHA },
      });
      expect(senhaAntiga.status).toBe(401);

      const senhaNova = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: novaSenha },
      });
      expect(senhaNova.status).toBeLessThan(400);

      // Uso único: o mesmo link não redefine de novo.
      const reuso = await client.request({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token, password: 'TerceiraSenha@2026' },
      });
      expect(reuso.status).toBe(422);
      expect(reuso.body.code).toBe('VALIDATION_FAILED');
    });

    it('token expirado não redefine nada', async () => {
      const token = await pedirToken(email);
      await ownerDb.query(
        `UPDATE iam.password_reset_tokens SET expires_at = now() - interval '1 minute'
          WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
      );

      const resposta = await client.request({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token, password: 'SenhaExpirada@2026' },
      });
      expect(resposta.status).toBe(422);
      expect(resposta.body.code).toBe('VALIDATION_FAILED');

      // A senha em vigor continua sendo a última trocada com token válido.
      const login = await client.request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: novaSenha },
      });
      expect(login.status).toBeLessThan(400);
    });

    it('token inventado não redefine nada', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token: 'a'.repeat(43), password: 'SenhaInventada@2026' },
      });
      expect(resposta.status).toBe(422);
      expect(resposta.body.code).toBe('VALIDATION_FAILED');
    });
  });

  // --------------------------------------------------------------- convite

  describe('convite e aceite', () => {
    const emailNovo = 'novo.convidado@chiron.dev';
    let convite: { id: string; token: string };

    it('o proprietário cria o convite e recebe o link em ambiente de teste', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/members/invite',
        cookie: owner.cookie,
        payload: { email: emailNovo, name: 'Novo Convidado', roleKey: 'receptionist' },
      });

      expect(resposta.status).toBeLessThan(400);
      expect(typeof resposta.body.id).toBe('string');
      expect(String(resposta.body.inviteUrl)).toContain('/convite/');
      convite = { id: resposta.body.id, token: tokenDoConvite(resposta.body.inviteUrl) };

      const { rows } = await ownerDb.query<{ tenant_id: string; accepted_at: Date | null; token_hash: string }>(
        `SELECT tenant_id, accepted_at, token_hash FROM iam.invitations WHERE id = $1`,
        [convite.id],
      );
      expect(rows[0]?.tenant_id).toBe(demoTenantId);
      expect(rows[0]?.accepted_at).toBeNull();
      // O banco guarda o hash, nunca o token que foi para o e-mail.
      expect(rows[0]?.token_hash).not.toBe(convite.token);
    });

    it('o aceite sem senha é recusado', async () => {
      const resposta = await aceitar(convite.token, { name: 'Novo Convidado' });
      expect(resposta.status).toBe(401);
      expect(resposta.body.code).toBe('INVALID_CREDENTIALS');
      expect(resposta.cookie).toBeUndefined();
    });

    it('token de convite inventado é recusado', async () => {
      const resposta = await aceitar('b'.repeat(43), { name: 'Ninguém', password: SENHA });
      expect(resposta.status).toBe(422);
      expect(resposta.body.code).toBe('VALIDATION_FAILED');
    });

    it('o aceite com e-mail novo cria conta, vínculo e papel', async () => {
      const resposta = await aceitar(convite.token, { name: 'Novo Convidado', password: SENHA });
      expect(resposta.status).toBeLessThan(400);
      expect(resposta.body.ok).toBe(true);
      expect(resposta.body.tenantId).toBe(demoTenantId);
      expect(resposta.cookie).toBeTruthy();

      const contexto = await client.request({ method: 'GET', url: '/me/context', cookie: resposta.cookie });
      expect(contexto.status).toBe(200);
      expect(contexto.body.user.email).toBe(emailNovo);
      expect(contexto.body.tenant.slug).toBe('demo');
      expect(contexto.body.membership.status).toBe('active');
      expect(contexto.body.membership.isOwner).toBe(false);
      expect(contexto.body.membership.roles.map((r: { key: string }) => r.key)).toContain('receptionist');

      const naLista = await membroDaLista(emailNovo);
      expect(naLista).toBeTruthy();
      expect(naLista.status).toBe('active');
      expect(naLista.roles.map((r: { key: string }) => r.key)).toContain('receptionist');
    });

    it('o mesmo token não serve duas vezes', async () => {
      const resposta = await aceitar(convite.token, { name: 'Novo Convidado', password: SENHA });
      expect(resposta.status).toBe(422);
      expect(resposta.body.code).toBe('VALIDATION_FAILED');
      expect(resposta.cookie).toBeUndefined();
    });

    it('convidar quem já faz parte da organização é recusado', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/members/invite',
        cookie: owner.cookie,
        payload: { email: emailNovo, name: 'Novo Convidado', roleKey: 'technician' },
      });
      expect(resposta.status).toBe(409);
      expect(resposta.body.code).toBe('CONFLICT');
    });

    it('o convite de outra organização não é legível com o tenant errado', async () => {
      const conviteBeta = await convidar(betaOwner, {
        email: 'convidado.beta@chiron.dev',
        name: 'Convidado Beta',
        roleKey: 'receptionist',
      });

      expect(await convitesVisiveis(conviteBeta.id, demoTenantId)).toBe(0);
      expect(await convitesVisiveis(conviteBeta.id, betaTenantId)).toBe(1);
    });
  });

  // ------------------------------------------- aceite com conta já existente

  describe('aceite de convite para e-mail que já tem conta', () => {
    const email = 'conta.existente@chiron.dev';
    let conta: Membro;
    let convite: { id: string; token: string };

    beforeAll(async () => {
      // Conta com senha definida no tenant demo. O convite vem do beta: aceitar
      // é agir como esta pessoa em outra clínica, e por isso pede a senha dela.
      conta = await criarMembro(email, 'Conta Existente', 'receptionist');
      convite = await convidar(betaOwner, { email, name: 'Conta Existente', roleKey: 'receptionist' });
    });

    afterAll(async () => {
      // As tentativas erradas deste bloco não podem sobrar para as próximas.
      await destravarConta(email);
    });

    it('não diz se o e-mail já tem conta: sem senha e com senha errada respondem igual', async () => {
      const semSenha = await aceitar(convite.token, { name: 'Conta Existente' });
      const senhaErrada = await aceitar(convite.token, {
        name: 'Conta Existente',
        password: 'senha-que-nao-e-dela',
      });

      expect(semSenha.status).toBe(401);
      expect(senhaErrada.status).toBe(semSenha.status);
      expect(senhaErrada.body.code).toBe(semSenha.body.code);
      expect(senhaErrada.body.message).toBe(semSenha.body.message);
      expect(senhaErrada.cookie).toBeUndefined();
    });

    it('a senha errada conta como falha, não cria vínculo e fica na auditoria', async () => {
      const antes = await contaDe(email);

      const resposta = await aceitar(convite.token, {
        name: 'Conta Existente',
        password: 'outra-senha-errada',
      });
      expect(resposta.status).toBe(401);
      expect(resposta.body.code).toBe('INVALID_CREDENTIALS');
      expect(resposta.cookie).toBeUndefined();

      const depois = await contaDe(email);
      expect(depois.failed_login_attempts).toBe(antes.failed_login_attempts + 1);

      // Nenhum vínculo na outra organização: era isso que permitia assinar
      // prontuário no lugar de outra pessoa.
      const vinculo = await ownerDb.query(`SELECT 1 FROM iam.memberships WHERE user_id = $1 AND tenant_id = $2`, [
        conta.userId,
        betaTenantId,
      ]);
      expect(vinculo.rowCount).toBe(0);

      // O convite continua de pé: senha errada não queima o token.
      const convitePendente = await ownerDb.query<{ accepted_at: Date | null }>(
        `SELECT accepted_at FROM iam.invitations WHERE id = $1`,
        [convite.id],
      );
      expect(convitePendente.rows[0]?.accepted_at).toBeNull();

      const auditoria = await client.request({
        method: 'GET',
        url: '/audit?action=invitation.accept.failed&limit=5',
        cookie: betaOwner.cookie,
      });
      expect(auditoria.status).toBe(200);
      expect(auditoria.body.items.length).toBeGreaterThan(0);
    });

    it('com a senha da conta o aceite vincula a mesma pessoa, sem criar usuário novo', async () => {
      const resposta = await aceitar(convite.token, { name: 'Conta Existente', password: SENHA });
      expect(resposta.status).toBeLessThan(400);
      expect(resposta.body.tenantId).toBe(betaTenantId);
      expect(resposta.cookie).toBeTruthy();

      const contexto = await client.request({ method: 'GET', url: '/me/context', cookie: resposta.cookie });
      expect(contexto.status).toBe(200);
      // Mesma conta, agora em duas organizações: nenhum usuário duplicado.
      expect(contexto.body.user.id).toBe(conta.userId);
      expect(contexto.body.user.email).toBe(email);
      expect(contexto.body.tenant.slug).toBe('beta');
      expect(contexto.body.availableTenants).toHaveLength(2);

      const contas = await ownerDb.query(`SELECT 1 FROM iam.users WHERE email = $1`, [email]);
      expect(contas.rowCount).toBe(1);

      const vinculos = await ownerDb.query(`SELECT tenant_id FROM iam.memberships WHERE user_id = $1`, [
        conta.userId,
      ]);
      expect(vinculos.rowCount).toBe(2);
    });
  });

  // ------------------------------------------------------- escalada de papel

  describe('escalada de papel', () => {
    let gestor: Session;
    let recepcao: Session;

    beforeAll(async () => {
      // O gestor tem member:invite e member:update, mas não é o proprietário.
      await criarMembro('gestor.teste@chiron.dev', 'Gestor de Teste', 'admin');
      gestor = await client.login('gestor.teste@chiron.dev', SENHA, 'demo');
      recepcao = await client.login('recepcao@chiron.dev', SENHA, 'demo');
    });

    it('o gestor ajusta o papel de um membro para um papel comum', async () => {
      const resposta = await client.request({
        method: 'PATCH',
        url: `/members/${membro.membershipId}`,
        cookie: gestor.cookie,
        payload: { roleKey: 'technician' },
      });
      expect(resposta.status).toBeLessThan(400);
    });

    it('o gestor não promove ninguém a proprietário', async () => {
      const resposta = await client.request({
        method: 'PATCH',
        url: `/members/${membro.membershipId}`,
        cookie: gestor.cookie,
        payload: { roleKey: 'owner' },
      });
      expect(resposta.status).toBe(403);
      expect(resposta.body.code).toBe('FORBIDDEN');

      // O papel anterior continua valendo: a recusa não deixou meia alteração.
      const naLista = await membroDaLista(membro.email);
      expect(naLista.roles.map((r: { key: string }) => r.key)).toContain('technician');
      expect(naLista.isOwner).toBe(false);
    });

    it('o gestor não convida alguém como proprietário', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/members/invite',
        cookie: gestor.cookie,
        payload: { email: 'dono.paralelo@chiron.dev', name: 'Dono Paralelo', roleKey: 'owner' },
      });
      expect(resposta.status).toBe(403);
      expect(resposta.body.code).toBe('FORBIDDEN');

      const convites = await ownerDb.query(`SELECT 1 FROM iam.invitations WHERE email = $1`, [
        'dono.paralelo@chiron.dev',
      ]);
      expect(convites.rowCount).toBe(0);
    });

    it('quem não tem a permissão nem chega a convidar', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/members/invite',
        cookie: recepcao.cookie,
        payload: { email: 'convite.recepcao@chiron.dev', name: 'Convite Recepção', roleKey: 'receptionist' },
      });
      expect(resposta.status).toBe(403);
      expect(resposta.body.details?.permission).toBe('member:invite');
    });

    it('o proprietário concede o papel de proprietário', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/members/invite',
        cookie: owner.cookie,
        payload: { email: 'socio.novo@chiron.dev', name: 'Sócio Novo', roleKey: 'owner' },
      });
      expect(resposta.status).toBeLessThan(400);
      expect(typeof resposta.body.id).toBe('string');
    });
  });

  // --------------------------------------------------------------- step-up

  describe('reautenticação para ação sensível', () => {
    const email = 'admin@chiron.dev';
    let sessao: Session;

    beforeAll(async () => {
      // Sessão só deste bloco: retroagir o auth_time dela não afeta as outras.
      sessao = await client.login(email, SENHA, 'demo');
    });

    afterAll(async () => {
      await destravarConta(email);
    });

    async function editarMembro() {
      return client.request({
        method: 'PATCH',
        url: `/members/${membro.membershipId}`,
        cookie: sessao.cookie,
        payload: { allFacilities: true },
      });
    }

    it('a sessão recém-aberta já satisfaz a reautenticação', async () => {
      const resposta = await editarMembro();
      expect(resposta.status).toBeLessThan(400);
      expect(resposta.body.ok).toBe(true);
    });

    it('sem reautenticação recente a ação protegida é recusada', async () => {
      await envelhecerSessao(sessao.cookie);

      const resposta = await editarMembro();
      expect(resposta.status).toBe(403);
      expect(resposta.body.code).toBe('STEP_UP_REQUIRED');
      expect(resposta.body.details.maxAgeMinutes).toBeGreaterThan(0);
    });

    it('a senha errada não libera a ação e conta como tentativa', async () => {
      const antes = await contaDe(email);

      const stepUp = await client.request({
        method: 'POST',
        url: '/auth/step-up',
        cookie: sessao.cookie,
        payload: { password: 'senha-errada-no-step-up' },
      });
      expect(stepUp.status).toBe(401);
      expect(stepUp.body.code).toBe('INVALID_CREDENTIALS');

      const depois = await contaDe(email);
      expect(depois.failed_login_attempts).toBe(antes.failed_login_attempts + 1);

      const aindaRecusada = await editarMembro();
      expect(aindaRecusada.status).toBe(403);
      expect(aindaRecusada.body.code).toBe('STEP_UP_REQUIRED');
    });

    it('com a senha certa a ação passa e o contador de tentativas zera', async () => {
      const stepUp = await client.request({
        method: 'POST',
        url: '/auth/step-up',
        cookie: sessao.cookie,
        payload: { password: SENHA },
      });
      expect(stepUp.status).toBeLessThan(400);

      const resposta = await editarMembro();
      expect(resposta.status).toBeLessThan(400);
      expect(resposta.body.ok).toBe(true);

      const conta = await contaDe(email);
      expect(conta.failed_login_attempts).toBe(0);
      expect(conta.locked_until).toBeNull();
    });

    it('sem sessão não há reautenticação', async () => {
      const resposta = await client.request({
        method: 'POST',
        url: '/auth/step-up',
        payload: { password: SENHA },
      });
      expect(resposta.status).toBe(401);
    });
  });
});
