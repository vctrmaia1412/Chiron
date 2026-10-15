import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Manutenção do cadastro do jeito que a recepção faz no balcão: trocar e
 * somar tutor, alerta de manejo, microchip digitado errado, paciente que
 * deixou de ser cliente e tutor que não volta mais. Nada disso pode apagar
 * história nem deixar o cadastro num beco sem saída.
 */
describe('manutenção do cadastro de paciente e tutor', () => {
  let client: TestClient;
  let recep: Session;
  let vet: Session;
  let tenantId: string;
  let dogId: string;

  type Link = { guardianId: string; guardianName: string; isPrimary: boolean; role: string };

  async function as(session: Session, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
    return client.request({ method, url, cookie: session.cookie, tenant: tenantId, payload });
  }

  async function createPatient(name: string, extra: Record<string, unknown> = {}) {
    const response = await as(recep, 'POST', '/patients', {
      name,
      speciesId: dogId,
      newGuardian: { personType: 'individual', name: `Tutor de ${name}`, phonePrimary: '(11) 96666-0000' },
      ...extra,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; name: string; number: number; guardians: Link[] };
  }

  async function createGuardian(name: string) {
    const response = await as(recep, 'POST', '/guardians', { name, phonePrimary: '(11) 95555-1234' });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; name: string };
  }

  beforeAll(async () => {
    client = await createTestClient();
    recep = await client.login('recepcao@chiron.dev');
    vet = await client.login('vet@chiron.dev');
    tenantId = recep.tenantId!;

    const species = await client.request({ method: 'GET', url: '/species', cookie: recep.cookie });
    dogId = species.body.items.find((s: { code: string }) => s.code === 'dog').id;
  });

  afterAll(async () => {
    await client?.close();
  });

  it('vincula cotutor, troca o principal e não deixa o paciente sem tutor', async () => {
    const patient = await createPatient('Biscoito Manutenção');
    const first = patient.guardians[0]!;
    expect(first.isPrimary).toBe(true);

    const second = await createGuardian('Cotutora Manutenção');
    const linked = await as(recep, 'POST', `/patients/${patient.id}/guardians`, {
      guardianId: second.id,
      role: 'co_owner',
    });
    expect(linked.status, JSON.stringify(linked.body)).toBe(201);
    expect(linked.body.guardians).toHaveLength(2);
    // Vincular sem marcar principal não tira o principal de quem já era.
    expect(linked.body.guardians.find((l: Link) => l.guardianId === first.guardianId).isPrimary).toBe(true);

    const again = await as(recep, 'POST', `/patients/${patient.id}/guardians`, { guardianId: second.id });
    expect(again.status).toBe(409);

    const switched = await as(recep, 'POST', `/patients/${patient.id}/guardians/${second.id}/primary`);
    expect(switched.status, JSON.stringify(switched.body)).toBe(201);
    const primaries = switched.body.guardians.filter((l: Link) => l.isPrimary);
    expect(primaries.map((l: Link) => l.guardianId)).toEqual([second.id]);

    // Sai o principal: o outro assume sozinho, e o vínculo encerrado some da ficha.
    const unlinked = await as(recep, 'DELETE', `/patients/${patient.id}/guardians/${second.id}`);
    expect(unlinked.status, JSON.stringify(unlinked.body)).toBe(200);
    expect(unlinked.body.guardians).toHaveLength(1);
    expect(unlinked.body.guardians[0].guardianId).toBe(first.guardianId);
    expect(unlinked.body.guardians[0].isPrimary).toBe(true);

    // O ex-tutor não lista mais o paciente.
    const byOld = await as(recep, 'GET', `/patients?guardianId=${second.id}`);
    expect(byOld.body.items.map((p: { id: string }) => p.id)).not.toContain(patient.id);

    const last = await as(recep, 'DELETE', `/patients/${patient.id}/guardians/${first.guardianId}`);
    expect(last.status).toBe(409);
    expect(last.body.message).toContain('pelo menos um tutor');

    // Tutor novo cadastrado no próprio vínculo, já como principal.
    const created = await as(recep, 'POST', `/patients/${patient.id}/guardians`, {
      newGuardian: { name: 'Tutor Novo No Balcão', phonePrimary: '(11) 94444-0000' },
      role: 'owner',
      isPrimary: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.guardians).toHaveLength(2);
    const primary = created.body.guardians.find((l: Link) => l.isPrimary);
    expect(primary.guardianName).toBe('Tutor Novo No Balcão');

    // Agora o tutor original pode sair: sobra o novo.
    const swap = await as(recep, 'DELETE', `/patients/${patient.id}/guardians/${first.guardianId}`);
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(swap.body.guardians.map((l: Link) => l.guardianName)).toEqual(['Tutor Novo No Balcão']);

    const missing = await as(recep, 'POST', `/patients/${patient.id}/guardians`, { role: 'owner' });
    expect(missing.status).toBe(422);
  });

  it('alerta de manejo entra e sai da ficha sem apagar o registro', async () => {
    const patient = await createPatient('Trovão Manutenção');

    const added = await as(recep, 'POST', `/patients/${patient.id}/alerts`, {
      kind: 'aggressive',
      message: 'Morde ao manipular as patas',
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const withAlert = await as(recep, 'GET', `/patients/${patient.id}`);
    expect(withAlert.body.alerts.map((a: { id: string }) => a.id)).toContain(added.body.id);

    const listed = await as(recep, 'GET', `/patients?q=${encodeURIComponent('Trovão Manutenção')}`);
    expect(listed.body.items[0].alertCount).toBe(1);

    const system = await as(recep, 'POST', `/patients/${patient.id}/alerts`, { kind: 'no_guardian', message: 'x' });
    expect(system.status).toBe(422);

    const removed = await as(recep, 'DELETE', `/patients/${patient.id}/alerts/${added.body.id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    const after = await as(recep, 'GET', `/patients/${patient.id}`);
    expect(after.body.alerts).toHaveLength(0);

    const twice = await as(recep, 'DELETE', `/patients/${patient.id}/alerts/${added.body.id}`);
    expect(twice.status).toBe(404);
  });

  it('microchip repetido diz onde já está, e o removido libera o número', async () => {
    const owner = await createPatient('Chip Original');
    const other = await createPatient('Chip Outro');

    const added = await as(recep, 'POST', `/patients/${owner.id}/identifiers`, {
      scheme: 'microchip',
      value: '985 112 000 777 001',
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.value).toBe('985112000777001');

    const elsewhere = await as(recep, 'POST', `/patients/${other.id}/identifiers`, {
      scheme: 'microchip',
      value: '985112000777001',
    });
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.body.message).toContain('Chip Original');

    const same = await as(recep, 'POST', `/patients/${owner.id}/identifiers`, {
      scheme: 'microchip',
      value: '985-112-000-777-001',
    });
    expect(same.status).toBe(409);
    expect(same.body.message).toContain('neste paciente');

    const removed = await as(recep, 'DELETE', `/patients/${owner.id}/identifiers/${added.body.id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const ownerAfter = await as(recep, 'GET', `/patients/${owner.id}`);
    expect(ownerAfter.body.identifiers).toHaveLength(0);

    const moved = await as(recep, 'POST', `/patients/${other.id}/identifiers`, {
      scheme: 'microchip',
      value: '985112000777001',
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(201);

    // A busca pelo número só acha quem está com ele agora.
    const search = await as(recep, 'GET', '/patients?q=985112000777001');
    expect(search.body.items.map((p: { id: string }) => p.id)).toEqual([other.id]);
  });

  it('inativa e reativa paciente com motivo; inativo some do seletor e continua na busca', async () => {
    const patient = await createPatient('Fumaça Inativável');
    const q = encodeURIComponent('Fumaça Inativável');

    const inactivated = await as(recep, 'POST', `/patients/${patient.id}/inactivate`, {
      reason: 'Não é mais cliente',
    });
    expect(inactivated.status, JSON.stringify(inactivated.body)).toBe(201);
    expect(inactivated.body.status).toBe('inactive');
    expect(inactivated.body.inactiveReason).toBe('Não é mais cliente');
    expect(inactivated.body.inactivatedAt).toBeTruthy();

    const picker = await as(recep, 'GET', `/patients?q=${q}&status=active`);
    expect(picker.body.items.map((p: { id: string }) => p.id)).not.toContain(patient.id);

    const inactiveList = await as(recep, 'GET', `/patients?q=${q}&status=inactive,transferred`);
    expect(inactiveList.body.items.map((p: { id: string }) => p.id)).toContain(patient.id);

    const everyone = await as(recep, 'GET', `/patients?q=${q}`);
    expect(everyone.body.items.map((p: { id: string }) => p.id)).toContain(patient.id);

    const twice = await as(recep, 'POST', `/patients/${patient.id}/inactivate`, { reason: 'De novo' });
    expect(twice.status).toBe(409);

    const noReason = await as(recep, 'POST', `/patients/${patient.id}/reactivate`);
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(201);
    expect(noReason.body.status).toBe('active');
    expect(noReason.body.inactiveReason).toBeNull();

    const transferred = await as(recep, 'POST', `/patients/${patient.id}/inactivate`, {
      reason: 'Transferido para outra clínica',
      transferred: true,
    });
    expect(transferred.status).toBe(201);
    expect(transferred.body.status).toBe('transferred');

    const pickerAgain = await as(recep, 'GET', `/patients?q=${q}&status=active`);
    expect(pickerAgain.body.items.map((p: { id: string }) => p.id)).not.toContain(patient.id);

    // A edição comum não muda a situação do cadastro: só as rotas com motivo.
    const patched = await as(recep, 'PATCH', `/patients/${patient.id}`, { status: 'active', colorMarkings: 'Cinza' });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.status).toBe('transferred');

    const back = await as(recep, 'POST', `/patients/${patient.id}/reactivate`);
    expect(back.body.status).toBe('active');

    const emptyReason = await as(recep, 'POST', `/patients/${patient.id}/inactivate`, { reason: ' ' });
    expect(emptyReason.status).toBe(422);
  });

  it('óbito continua separado: não reativa nem inativa', async () => {
    const patient = await createPatient('Saudade Manutenção');
    const death = await as(vet, 'POST', `/patients/${patient.id}/deceased`, {
      occurredAt: new Date().toISOString(),
      kind: 'natural',
    });
    expect(death.status, JSON.stringify(death.body)).toBe(201);

    const reactivate = await as(recep, 'POST', `/patients/${patient.id}/reactivate`);
    expect(reactivate.status).toBe(409);
    const inactivate = await as(recep, 'POST', `/patients/${patient.id}/inactivate`, { reason: 'Teste' });
    expect(inactivate.status).toBe(409);

    const current = await as(recep, 'GET', `/patients/${patient.id}`);
    expect(current.body.status).toBe('deceased');
  });

  it('alergia sai da lista ativa como refutada, por decisão clínica', async () => {
    const patient = await createPatient('Pipoca Alérgica');
    const allergy = await as(recep, 'POST', `/patients/${patient.id}/allergies`, {
      substance: 'Dipirona',
      severity: 'moderate',
    });
    expect(allergy.status, JSON.stringify(allergy.body)).toBe(201);

    const byReception = await as(recep, 'PATCH', `/patients/${patient.id}/allergies/${allergy.body.id}`, {
      status: 'refuted',
    });
    expect(byReception.status).toBe(403);

    const refuted = await as(vet, 'PATCH', `/patients/${patient.id}/allergies/${allergy.body.id}`, {
      status: 'refuted',
      reason: 'Reexposição sem reação',
    });
    expect(refuted.status, JSON.stringify(refuted.body)).toBe(200);
    expect(refuted.body.status).toBe('refuted');

    const after = await as(vet, 'GET', `/patients/${patient.id}`);
    expect(after.body.allergies).toHaveLength(0);

    const twice = await as(vet, 'PATCH', `/patients/${patient.id}/allergies/${allergy.body.id}`, {
      status: 'inactive',
    });
    expect(twice.status).toBe(404);
  });

  it('tutor inativado sai do seletor, mantém os pacientes e não recebe vínculo novo', async () => {
    const guardian = await createGuardian('Tutor Que Mudou');
    const patient = await createPatient('Bolota do Tutor Inativo', {
      newGuardian: undefined,
      guardians: [{ guardianId: guardian.id, role: 'owner', isPrimary: true }],
    });
    const q = encodeURIComponent('Tutor Que Mudou');

    const inactivated = await as(recep, 'POST', `/guardians/${guardian.id}/inactivate`, {
      reason: 'Mudou de cidade',
    });
    expect(inactivated.status, JSON.stringify(inactivated.body)).toBe(201);
    expect(inactivated.body.inactiveAt).toBeTruthy();
    expect(inactivated.body.inactiveReason).toBe('Mudou de cidade');
    expect(inactivated.body.patients).toHaveLength(1);

    const picker = await as(recep, 'GET', `/guardians?q=${q}&status=active`);
    expect(picker.body.items.map((g: { id: string }) => g.id)).not.toContain(guardian.id);
    const inactiveList = await as(recep, 'GET', `/guardians?q=${q}&status=inactive`);
    expect(inactiveList.body.items.map((g: { id: string }) => g.id)).toContain(guardian.id);
    const all = await as(recep, 'GET', `/guardians?q=${q}`);
    expect(all.body.items.map((g: { id: string }) => g.id)).toContain(guardian.id);

    // O paciente continua com ele, sinalizado na ficha.
    const ficha = await as(recep, 'GET', `/patients/${patient.id}`);
    expect(ficha.body.guardians[0].guardianInactive).toBe(true);

    const other = await createPatient('Outro Animal Qualquer');
    const link = await as(recep, 'POST', `/patients/${other.id}/guardians`, { guardianId: guardian.id });
    expect(link.status).toBe(409);
    expect(link.body.message).toContain('inativo');

    const newPatient = await as(recep, 'POST', '/patients', {
      name: 'Filhote Recusado',
      speciesId: dogId,
      guardians: [{ guardianId: guardian.id, role: 'owner', isPrimary: true }],
    });
    expect(newPatient.status).toBe(409);

    const twice = await as(recep, 'POST', `/guardians/${guardian.id}/inactivate`, { reason: 'De novo' });
    expect(twice.status).toBe(409);

    const reactivated = await as(recep, 'POST', `/guardians/${guardian.id}/reactivate`);
    expect(reactivated.status, JSON.stringify(reactivated.body)).toBe(201);
    expect(reactivated.body.inactiveAt).toBeNull();

    const pickerAgain = await as(recep, 'GET', `/guardians?q=${q}&status=active`);
    expect(pickerAgain.body.items.map((g: { id: string }) => g.id)).toContain(guardian.id);
  });

  it('paginação por cursor não pula nem repete cadastro criado no mesmo instante', async () => {
    // O seed cria dezenas de cadastros na mesma transação, com o mesmo
    // created_at: exatamente o caso em que cursor só por data pula linhas.
    async function walk(resource: string, limit: number): Promise<string[]> {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 200; page += 1) {
        const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const response = await as(recep, 'GET', `${resource}?limit=${limit}${query}`);
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        seen.push(...response.body.items.map((item: { id: string }) => item.id));
        cursor = response.body.nextCursor;
        if (!cursor) return seen;
      }
      throw new Error('paginação não terminou');
    }

    for (const resource of ['/patients', '/guardians']) {
      const big = await walk(resource, 100);
      const small = await walk(resource, 3);
      expect(small).toEqual(big);
      expect(new Set(small).size).toBe(small.length);
      expect(small.length).toBeGreaterThan(10);
    }
  });
});
