import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Registro rápido: modelos, diagnósticos do catálogo, problemas, resumo do
 * paciente, sugestões de receita e protocolos vacinais. O ponto de cada teste
 * é o mesmo: o que já foi dito ou digitado uma vez volta pronto, sem campo
 * novo para o veterinário preencher.
 */
describe('registro rápido', () => {
  let client: TestClient;
  let vet: Session;
  let beta: Session;
  let tenantId: string;
  let dogId: string;
  let cattleId: string;
  let consultaId: string;
  let professionalId: string;
  let patientId: string;
  let encounterId: string;

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    beta = await client.login('beta@chiron.dev', 'Chiron@2026', 'beta');
    tenantId = vet.tenantId!;

    const species = await client.request({ method: 'GET', url: '/species', cookie: vet.cookie });
    dogId = species.body.items.find((s: { code: string }) => s.code === 'dog').id;
    cattleId = species.body.items.find((s: { code: string }) => s.code === 'cattle').id;

    const services = await client.request({ method: 'GET', url: '/services', cookie: vet.cookie });
    consultaId = services.body.items.find((s: { key: string }) => s.key === 'consulta').id;

    const me = await client.request({ method: 'GET', url: '/me/context', cookie: vet.cookie });
    professionalId = me.body.membership.professionalId;

    const patient = await client.request({
      method: 'POST',
      url: '/patients',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        name: 'Paçoca',
        speciesId: dogId,
        sex: 'female',
        reproductiveStatus: 'spayed',
        birthDate: '2021-02-01',
        birthDatePrecision: 'exact',
        weightKg: 12,
        newGuardian: { personType: 'individual', name: 'Tutora Registro Rápido', phonePrimary: '(11) 98888-0000' },
      },
    });
    expect(patient.status, JSON.stringify(patient.body)).toBe(201);
    patientId = patient.body.id;
  });

  afterAll(async () => {
    await client?.close();
  });

  describe('modelos e atalhos', () => {
    it('lista os modelos de fábrica filtrados pela espécie', async () => {
      const dog = await client.request({ method: 'GET', url: `/note-templates?speciesId=${dogId}`, cookie: vet.cookie });
      expect(dog.status).toBe(200);
      const dogShortcuts = dog.body.items.map((t: { shortcut: string }) => t.shortcut);
      expect(dogShortcuts).toEqual(expect.arrayContaining(['vacina', 'otite', 'sad']));
      expect(dogShortcuts).not.toContain('mastite');

      const cattle = await client.request({
        method: 'GET',
        url: `/note-templates?speciesId=${cattleId}`,
        cookie: vet.cookie,
      });
      const cattleShortcuts = cattle.body.items.map((t: { shortcut: string }) => t.shortcut);
      expect(cattleShortcuts).toContain('mastite');
      expect(cattleShortcuts).not.toContain('otite');
    });

    it('a clínica cria o próprio modelo, que aparece antes dos de fábrica', async () => {
      const created = await client.request({
        method: 'POST',
        url: '/note-templates',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {
          kind: 'template',
          name: 'Consulta dermatológica da casa',
          shortcut: 'derma',
          sections: { history: 'Banho a cada __ dias.', plan: 'Retorno em 21 dias.' },
        },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.scope).toBe('tenant');

      const list = await client.request({ method: 'GET', url: '/note-templates', cookie: vet.cookie });
      expect(list.body.items[0].shortcut).toBe('derma');

      const duplicate = await client.request({
        method: 'POST',
        url: '/note-templates',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { kind: 'snippet', name: 'Outro', shortcut: 'derma', body: 'texto' },
      });
      expect(duplicate.status).toBe(409);

      const other = await client.request({ method: 'GET', url: '/note-templates', cookie: beta.cookie });
      expect(other.body.items.some((t: { shortcut: string }) => t.shortcut === 'derma')).toBe(false);

      const removed = await client.request({
        method: 'DELETE',
        url: `/note-templates/${created.body.id}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(removed.status).toBe(200);
    });

    it('modelo de fábrica não pode ser apagado pela clínica', async () => {
      const list = await client.request({ method: 'GET', url: '/note-templates', cookie: vet.cookie });
      const global = list.body.items.find((t: { scope: string }) => t.scope === 'global');
      const response = await client.request({
        method: 'DELETE',
        url: `/note-templates/${global.id}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(response.status).toBe(404);
    });
  });

  describe('diagnósticos', () => {
    it('busca sem acento e respeita a espécie', async () => {
      const ulcera = await client.request({
        method: 'GET',
        url: `/conditions?q=ulcera%20cor&speciesId=${dogId}`,
        cookie: vet.cookie,
      });
      expect(ulcera.status).toBe(200);
      expect(ulcera.body.items[0].name).toBe('Úlcera de córnea');
      expect(ulcera.body.items[0].id).toBeTruthy();

      const mastiteCao = await client.request({
        method: 'GET',
        url: `/conditions?q=mastite&speciesId=${dogId}`,
        cookie: vet.cookie,
      });
      expect(mastiteCao.body.items.some((c: { name: string }) => c.name === 'Mastite clínica')).toBe(false);
    });
  });

  describe('fluxo sem retrabalho', () => {
    it('a queixa do atendimento sem agenda já abre como nota', async () => {
      const response = await client.request({
        method: 'POST',
        url: '/encounters',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { patientId, serviceId: consultaId, class: 'outpatient', chiefComplaint: 'Coçando a orelha há uma semana' },
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      encounterId = response.body.id;
      const note = response.body.notes.find((n: { kind: string }) => n.kind === 'chief_complaint');
      expect(note?.body).toBe('Coçando a orelha há uma semana');
      expect(note?.status).toBe('draft');
    });

    it('o motivo do agendamento chega como queixa no check-in', async () => {
      const start = new Date();
      start.setDate(start.getDate() + 3);
      start.setHours(15, 0, 0, 0);
      const appointment = await client.request({
        method: 'POST',
        url: '/appointments',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {
          patientId,
          professionalId,
          serviceId: consultaId,
          startAt: start.toISOString(),
          reason: 'Mancando da pata traseira',
          // o seed ocupa a agenda relativa a hoje: o teste é da queixa, não do conflito
          allowOverlap: true,
        },
      });
      expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);

      const checkIn = await client.request({
        method: 'POST',
        url: `/appointments/${appointment.body.id}/check-in`,
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {},
      });
      expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(201);

      const encounter = await client.request({
        method: 'GET',
        url: `/encounters/${checkIn.body.encounterId}`,
        cookie: vet.cookie,
      });
      expect(encounter.body.chiefComplaint).toBe('Mancando da pata traseira');
      const note = encounter.body.notes.find((n: { kind: string }) => n.kind === 'chief_complaint');
      expect(note?.body).toBe('Mancando da pata traseira');
    });

    it('diagnóstico vai para a lista de problemas sem duplicar', async () => {
      const conditions = await client.request({ method: 'GET', url: '/conditions?q=otite', cookie: vet.cookie });
      const otite = conditions.body.items.find((c: { name: string }) => c.name === 'Otite externa');

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await client.request({
          method: 'POST',
          url: `/encounters/${encounterId}/diagnoses`,
          cookie: vet.cookie,
          tenant: tenantId,
          payload: { description: 'Otite externa', conditionId: otite.id, kind: 'presumptive', addToProblems: 'chronic' },
        });
        expect(response.status, JSON.stringify(response.body)).toBe(201);
      }

      const problems = await client.request({ method: 'GET', url: `/patients/${patientId}/problems`, cookie: vet.cookie });
      const otites = problems.body.items.filter((p: { description: string }) => p.description === 'Otite externa');
      expect(otites).toHaveLength(1);
      expect(otites[0].status).toBe('chronic');
      expect(otites[0].sourceEncounterId).toBe(encounterId);
    });

    it('problema pode ser resolvido e sai do resumo', async () => {
      const added = await client.request({
        method: 'POST',
        url: `/patients/${patientId}/problems`,
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { description: 'Sobrepeso', status: 'active' },
      });
      expect(added.status, JSON.stringify(added.body)).toBe(201);

      const resolved = await client.request({
        method: 'PATCH',
        url: `/patients/${patientId}/problems/${added.body.id}`,
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { status: 'resolved' },
      });
      expect(resolved.status).toBe(200);
      expect(resolved.body.resolvedAt).toBeTruthy();

      const summary = await client.request({
        method: 'GET',
        url: `/patients/${patientId}/clinical-summary`,
        cookie: vet.cookie,
      });
      const descriptions = summary.body.problems.map((p: { description: string }) => p.description);
      expect(descriptions).toContain('Otite externa');
      expect(descriptions).not.toContain('Sobrepeso');
    });
  });

  describe('receita', () => {
    it('medicamento assinado volta como sugestão e aparece em uso no resumo', async () => {
      const created = await client.request({
        method: 'POST',
        url: '/prescriptions',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {
          patientId,
          encounterId,
          items: [
            {
              drugName: 'Otoguard Registro Rápido',
              activeIngredient: 'Gentamicina',
              concentration: '3 mg/mL',
              doseValue: 4,
              doseUom: 'drop',
              route: 'otic',
              frequencyKind: 'interval_hours',
              frequencyValue: 12,
              durationDays: 10,
              quantity: 1,
              quantityUom: 'frasco',
            },
          ],
        },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);

      const signed = await client.request({
        method: 'POST',
        url: `/prescriptions/${created.body.id}/sign`,
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { allergiesReviewed: true },
      });
      expect(signed.status, JSON.stringify(signed.body)).toBe(201);

      const suggestions = await client.request({
        method: 'GET',
        url: `/medication-suggestions?q=otoguard&speciesId=${dogId}`,
        cookie: vet.cookie,
      });
      expect(suggestions.status).toBe(200);
      const suggestion = suggestions.body.items[0];
      expect(suggestion.drugName).toBe('Otoguard Registro Rápido');
      expect(suggestion.route).toBe('otic');
      expect(suggestion.durationDays).toBe(10);
      expect(suggestion.sameSpecies).toBe(true);

      const summary = await client.request({
        method: 'GET',
        url: `/patients/${patientId}/clinical-summary?excludeEncounterId=${encounterId}`,
        cookie: vet.cookie,
      });
      const medication = summary.body.activeMedications.find(
        (m: { drugName: string }) => m.drugName === 'Otoguard Registro Rápido',
      );
      expect(medication).toBeTruthy();
      expect(medication.posology).toContain('12');
      expect(medication.until).toBeTruthy();
    });

    it('protocolo de receita é salvo, listado e apagado só pela clínica dona', async () => {
      const created = await client.request({
        method: 'POST',
        url: '/prescription-templates',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {
          name: 'Otite: protocolo da casa',
          speciesId: dogId,
          items: [{ drugName: 'Otoguard Registro Rápido', doseValue: 4, doseUom: 'drop', route: 'otic' }],
        },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);

      const list = await client.request({
        method: 'GET',
        url: `/prescription-templates?speciesId=${dogId}`,
        cookie: vet.cookie,
      });
      expect(list.body.items.some((t: { id: string }) => t.id === created.body.id)).toBe(true);

      const otherTenant = await client.request({
        method: 'DELETE',
        url: `/prescription-templates/${created.body.id}`,
        cookie: beta.cookie,
        tenant: beta.tenantId!,
      });
      expect(otherTenant.status).toBe(404);

      const removed = await client.request({
        method: 'DELETE',
        url: `/prescription-templates/${created.body.id}`,
        cookie: vet.cookie,
        tenant: tenantId,
      });
      expect(removed.status).toBe(200);
    });
  });

  describe('consulta pelo celular', () => {
    it('histórico filtrado por tipo devolve só esses tipos, até o limite pedido', async () => {
      const all = await client.request({ method: 'GET', url: `/patients/${patientId}/timeline?limit=50`, cookie: vet.cookie });
      expect(all.status).toBe(200);
      const wanted = ['prescription.signed', 'patient.created'];
      expect(all.body.items.some((item: { kind: string }) => !wanted.includes(item.kind))).toBe(true);

      const clinical = await client.request({
        method: 'GET',
        url: `/patients/${patientId}/timeline?limit=2&kinds=${wanted.join(',')}`,
        cookie: vet.cookie,
      });
      expect(clinical.status).toBe(200);
      expect(clinical.body.items).toHaveLength(2);
      for (const item of clinical.body.items) {
        expect(wanted).toContain(item.kind);
      }
    });

    it('lista de exames busca pelo nome do paciente', async () => {
      const catalog = await client.request({ method: 'GET', url: '/exam-catalog', cookie: vet.cookie });
      const cbc = catalog.body.items.find((exam: { code: string }) => exam.code === 'CBC');
      const ordered = await client.request({
        method: 'POST',
        url: '/exam-orders',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { patientId, encounterId, items: [{ examCatalogId: cbc.id }] },
      });
      expect(ordered.status, JSON.stringify(ordered.body)).toBe(201);

      const found = await client.request({ method: 'GET', url: '/exam-orders?q=pa%C3%A7oc', cookie: vet.cookie });
      expect(found.status).toBe(200);
      expect(found.body.items.length).toBeGreaterThan(0);
      expect(found.body.items.every((order: { patient: { name: string } }) => order.patient.name === 'Paçoca')).toBe(true);

      const none = await client.request({ method: 'GET', url: '/exam-orders?q=nao-existe-ninguem', cookie: vet.cookie });
      expect(none.body.items).toHaveLength(0);
    });
  });

  describe('vacina por protocolo', () => {
    it('sabe a dose da vez e reaproveita o lote em uso', async () => {
      const before = await client.request({
        method: 'GET',
        url: `/vaccine-protocols?patientId=${patientId}`,
        cookie: vet.cookie,
      });
      expect(before.status).toBe(200);
      const v10 = before.body.items.find((p: { name: string }) => p.name === 'V8/V10 (polivalente)');
      expect(v10.nextDoseNumber).toBe(1);
      expect(v10.nextDoseLabel).toBe('1ª dose');
      expect(v10.suggestedNextDueAt).toBeTruthy();
      expect(before.body.items.some((p: { name: string }) => p.name.startsWith('V4/V5'))).toBe(false);

      const applied = await client.request({
        method: 'POST',
        url: '/immunizations',
        cookie: vet.cookie,
        tenant: tenantId,
        payload: {
          patientId,
          encounterId,
          protocolId: v10.id,
          vaccineName: v10.name,
          manufacturer: 'Fabricante Teste',
          lotNumber: 'LOTE-RR-01',
          expiresAt: '2030-12-31',
          route: 'sc',
          doseNumber: 1,
          nextDueAt: v10.suggestedNextDueAt,
        },
      });
      expect(applied.status, JSON.stringify(applied.body)).toBe(201);

      const after = await client.request({
        method: 'GET',
        url: `/vaccine-protocols?patientId=${patientId}`,
        cookie: vet.cookie,
      });
      const next = after.body.items.find((p: { id: string }) => p.id === v10.id);
      expect(next.dosesGiven).toBe(1);
      expect(next.nextDoseNumber).toBe(2);
      expect(next.lot.lotNumber).toBe('LOTE-RR-01');
      expect(after.body.items[0].id).toBe(v10.id);
    });
  });
});
