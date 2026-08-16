import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type Session, type TestClient } from './helpers/app';

/**
 * Fluxo clínico completo contra a API real, do cadastro ao prontuário.
 * Cada passo grava no PostgreSQL e o passo seguinte lê de volta o que foi
 * gravado: nenhum estado é mantido em memória entre as chamadas.
 */
describe('fluxo clínico ponta a ponta', () => {
  let client: TestClient;
  let vet: Session;
  let tenantId: string;
  let speciesId: string;
  let serviceId: string;
  let professionalId: string;

  let guardianId: string;
  let patientId: string;
  let appointmentId: string;
  let encounterId: string;
  let prescriptionId: string;

  beforeAll(async () => {
    client = await createTestClient();
    vet = await client.login('vet@chiron.dev');
    tenantId = vet.tenantId!;

    const species = await client.request({ method: 'GET', url: '/species', cookie: vet.cookie });
    speciesId = species.body.items.find((s: { code: string }) => s.code === 'dog').id;

    const services = await client.request({ method: 'GET', url: '/services', cookie: vet.cookie });
    serviceId = services.body.items.find((s: { key: string }) => s.key === 'consulta').id;

    // o profissional do próprio veterinário logado: quem atende é quem finaliza
    const me = await client.request({ method: 'GET', url: '/me/context', cookie: vet.cookie });
    professionalId = me.body.membership.professionalId;
  });

  afterAll(async () => {
    await client?.close();
  });

  it('1. cadastra tutor e paciente na mesma transação', async () => {
    const response = await client.request({
      method: 'POST',
      url: '/patients',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        name: 'Fumaça',
        speciesId,
        sex: 'male',
        reproductiveStatus: 'intact',
        birthDate: '2022-04-10',
        birthDatePrecision: 'exact',
        colorMarkings: 'Cinza rajado',
        weightKg: 8.4,
        newGuardian: {
          personType: 'individual',
          name: 'Teste Integração',
          documentKind: 'cpf',
          document: '45678912364',
          email: 'teste.integracao@exemplo.dev',
          phonePrimary: '(11) 90000-0000',
        },
        identifiers: [{ scheme: 'microchip', value: '981098100000001' }],
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    patientId = response.body.id;
    expect(response.body.name).toBe('Fumaça');
    expect(response.body.currentWeightKg).toBeTruthy();

    const guardians = await client.request({
      method: 'GET',
      url: `/patients/${patientId}`,
      cookie: vet.cookie,
    });
    expect(guardians.body.guardians?.length ?? 0).toBeGreaterThan(0);
    guardianId = guardians.body.guardians[0].guardianId ?? guardians.body.guardians[0].id;
  });

  it('2. o paciente persiste e aparece na busca', async () => {
    const search = await client.request({ method: 'GET', url: '/search?q=Fuma', cookie: vet.cookie });
    const found = search.body.items.find((i: { id: string }) => i.id === patientId);
    expect(found).toBeTruthy();
  });

  it('3. agenda um atendimento para o paciente', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);

    const response = await client.request({
      method: 'POST',
      url: '/appointments',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId,
        guardianId,
        professionalId,
        serviceId,
        startAt: start.toISOString(),
        reason: 'Vômito há dois dias',
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    appointmentId = response.body.id;
    expect(response.body.status).toBe('scheduled');
  });

  it('4. recusa agendamento sobreposto para o mesmo profissional', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 10, 0, 0);

    const response = await client.request({
      method: 'POST',
      url: '/appointments',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { patientId, professionalId, serviceId, startAt: start.toISOString() },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');
    expect(String(response.body.message)).toContain('horário');
  });

  it('5. check-in abre o atendimento e registra o peso', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/appointments/${appointmentId}/check-in`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { weightKg: 8.6, weightUom: 'kg' },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    encounterId = response.body.encounterId ?? response.body.encounter?.id;
    expect(encounterId).toBeTruthy();

    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    expect(encounter.body.status).toBe('arrived');
    expect(Number(encounter.body.weightKg)).toBeCloseTo(8.6, 2);
  });

  it('6. registra triagem com sinais vitais normalizados', async () => {
    const triage = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/triage`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        observations: [
          { code: 'temperature', value: 103.1, uom: 'F' },
          { code: 'heart_rate', value: 110, uom: 'bpm' },
          { code: 'respiratory_rate', value: 30, uom: 'mpm' },
          { code: 'mucous_membranes', value: 'rosadas' },
        ],
        note: 'Animal alerta, desconforto abdominal à palpação superficial.',
      },
    });
    expect(triage.status, JSON.stringify(triage.body)).toBe(201);

    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    expect(encounter.body.status).toBe('triaged');

    const temperature = encounter.body.observations.find((o: { code: string }) => o.code === 'temperature');
    expect(Number(temperature.valueNumeric)).toBeCloseTo(39.5, 1);
    expect(temperature.uom).toBe('C');
    expect(temperature.enteredUom).toBe('F');
  });

  it('7. inicia o atendimento', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/start`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {},
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.status).toBe('in_progress');
  });

  it('8. grava notas clínicas', async () => {
    for (const [kind, body] of [
      ['chief_complaint', 'Vômito há dois dias, sem diarreia.'],
      ['history', 'Sem acesso à rua. Ração comercial. Vacinação em dia.'],
      ['physical_exam', 'Escore corporal 5/9, abdome sensível em região cranial, sem massas palpáveis.'],
      ['assessment', 'Gastrite aguda provável, sem sinais de abdome agudo cirúrgico.'],
      ['plan', 'Antiemético por 3 dias, dieta leve e retorno em 7 dias se não houver melhora.'],
    ] as const) {
      const response = await client.request({
        method: 'POST',
        url: `/encounters/${encounterId}/notes`,
        cookie: vet.cookie,
        tenant: tenantId,
        payload: { kind, body },
      });
      expect(response.status, `${kind}: ${JSON.stringify(response.body)}`).toBe(201);
    }

    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    expect(encounter.body.notes.length).toBeGreaterThanOrEqual(5);
  });

  it('9. registra diagnóstico', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/diagnoses`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { description: 'Gastrite aguda', kind: 'presumptive', rank: 1 },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
  });

  it('10. emite receita com dose calculada pelo peso', async () => {
    const response = await client.request({
      method: 'POST',
      url: '/prescriptions',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId,
        encounterId,
        notes: 'Administrar longe das refeições.',
        items: [
          {
            drugName: 'Maropitant 10 mg/mL',
            activeIngredient: 'Maropitant',
            concentration: '10 mg/mL',
            doseValue: 1,
            doseUom: 'mg',
            dosePerKg: true,
            route: 'sc',
            frequencyKind: 'interval_hours',
            frequencyValue: 24,
            durationDays: 3,
            quantity: 1,
            quantityUom: 'frasco',
            instructions: 'Aplicar uma vez ao dia por três dias.',
          },
        ],
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    prescriptionId = response.body.id;
    expect(response.body.status).toBe('draft');
    const item = response.body.items[0];
    expect(Number(item.computedDoseValue)).toBeCloseTo(8.6, 2);
  });

  it('11. recusa receita com dose por quilo sem peso registrado', async () => {
    const semPeso = await client.request({
      method: 'POST',
      url: '/patients',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        name: 'Sem Peso',
        speciesId,
        newGuardian: { name: 'Tutor Sem Peso', documentKind: 'none' },
      },
    });
    expect(semPeso.status).toBe(201);

    const response = await client.request({
      method: 'POST',
      url: '/prescriptions',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId: semPeso.body.id,
        items: [
          {
            drugName: 'Maropitant 10 mg/mL',
            doseValue: 1,
            doseUom: 'mg',
            dosePerKg: true,
            route: 'sc',
            frequencyKind: 'interval_hours',
            frequencyValue: 24,
            durationDays: 3,
          },
        ],
      },
    });

    expect(response.status).toBe(422);
    expect(String(response.body.message)).toContain('peso');
  });

  it('12. assina a receita e gera o documento', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/prescriptions/${prescriptionId}/sign`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { allergiesReviewed: true },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.status).toBe('signed');
    expect(response.body.signedAt).toBeTruthy();
    expect(response.body.documentId).toBeTruthy();
  });

  it('13. receita assinada não volta a rascunho', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/prescriptions/${prescriptionId}/sign`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { allergiesReviewed: true },
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('14. solicita exame vinculado ao atendimento', async () => {
    const catalog = await client.request({ method: 'GET', url: '/exam-catalog', cookie: vet.cookie });
    const cbc = catalog.body.items.find((e: { code: string }) => e.code === 'CBC');

    const response = await client.request({
      method: 'POST',
      url: '/exam-orders',
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        patientId,
        encounterId,
        priority: 'routine',
        clinicalInfo: 'Vômito agudo, avaliar leucograma.',
        items: [{ examCatalogId: cbc.id }],
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.status).toBe('ordered');
  });

  it('15. finaliza o atendimento e assina as notas', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/finish`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { disposition: 'discharged', followUpReason: 'Reavaliação clínica' },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.status).toBe('finished');
    expect(response.body.integrityHash).toBeTruthy();
    expect(response.body.notes.every((n: { status: string }) => n.status !== 'draft')).toBe(true);
  });

  it('16. atendimento finalizado recusa nova nota', async () => {
    const response = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/notes`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: { kind: 'progress', body: 'Tentativa de escrita após finalizar.' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ENCOUNTER_LOCKED');
  });

  it('17. nota assinada só muda por adendo, preservando a versão anterior', async () => {
    const encounter = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    const note = encounter.body.notes.find((n: { kind: string }) => n.kind === 'assessment');

    const amend = await client.request({
      method: 'POST',
      url: `/encounters/${encounterId}/notes/${note.id}/amend`,
      cookie: vet.cookie,
      tenant: tenantId,
      payload: {
        body: 'Gastrite aguda, provável origem alimentar. Retificação após conversa com o tutor.',
        reason: 'Informação complementar do tutor',
      },
    });
    expect(amend.status, JSON.stringify(amend.body)).toBe(201);

    const after = await client.request({ method: 'GET', url: `/encounters/${encounterId}`, cookie: vet.cookie });
    const versions = after.body.notes.filter((n: { kind: string }) => n.kind === 'assessment');
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const superseded = versions.find((n: { supersededByNoteId: string | null }) => n.supersededByNoteId);
    expect(superseded).toBeTruthy();
  });

  it('18. o prontuário mostra o histórico real, montado das fontes de verdade', async () => {
    const record = await client.request({ method: 'GET', url: `/patients/${patientId}/record`, cookie: vet.cookie });
    expect(record.status).toBe(200);
    expect(record.body.encounters.length).toBe(1);

    const [entry] = record.body.encounters;
    expect(entry.encounter.status).toBe('finished');
    expect(entry.notes.length).toBeGreaterThanOrEqual(5);
    expect(entry.diagnoses.length).toBe(1);
    expect(entry.observations.length).toBeGreaterThanOrEqual(4);
    expect(entry.prescriptions.length).toBe(1);
    expect(entry.examOrderIds.length).toBe(1);
  });

  it('19. a linha do tempo agrega os eventos do paciente', async () => {
    const timeline = await client.request({
      method: 'GET',
      url: `/patients/${patientId}/timeline`,
      cookie: vet.cookie,
    });
    expect(timeline.status).toBe(200);

    const kinds = timeline.body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain('patient.created');
    expect(kinds).toContain('encounter.finished');
    expect(kinds).toContain('prescription.signed');
    expect(kinds).toContain('exam.ordered');
  });

  it('20. a leitura do prontuário fica registrada no log de acesso', async () => {
    const admin = await client.login('admin@chiron.dev');
    const access = await client.request({
      method: 'GET',
      url: `/audit/access?patientId=${patientId}`,
      cookie: admin.cookie,
    });
    expect(access.status).toBe(200);
    expect(access.body.items.some((i: { resource: string }) => i.resource === 'record')).toBe(true);
  });

  it('21. a auditoria registra a assinatura da receita', async () => {
    const admin = await client.login('admin@chiron.dev');
    const audit = await client.request({
      method: 'GET',
      url: `/audit?entityTable=prescriptions&entityId=${prescriptionId}`,
      cookie: admin.cookie,
    });
    expect(audit.status).toBe(200);
    expect(audit.body.items.some((i: { action: string }) => i.action.includes('sign'))).toBe(true);
  });
});
