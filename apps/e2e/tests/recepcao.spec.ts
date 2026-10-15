import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, settle, test, uniqueName, type Api } from './fixtures';

/**
 * Um dia de recepção: cliente novo liga, é cadastrado e agendado; chega,
 * faz check-in com peso e o atendimento abre já com o motivo como queixa;
 * outro desmarca; outro não aparece.
 */
test.use({ role: 'recepcao' });

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Horário de hoje mais à frente, com minutos "quebrados" para não colidir com o seed. */
function laterToday(minutesAhead: number): { date: string; time: string; iso: string } {
  const at = new Date(Date.now() + minutesAhead * 60_000);
  at.setSeconds(0, 0);
  if (at.getDate() !== new Date().getDate()) at.setHours(23, 30);
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return { date: todayIso(), time: `${hh}:${mm}`, iso: at.toISOString() };
}

async function createPatient(api: Api, name: string): Promise<{ id: string; guardianId: string }> {
  const species = await api.get<{ items: Array<{ id: string; code: string }> }>('/species');
  const dog = species.items.find((item) => item.code === 'dog')!;
  const patient = await api.post<{ id: string; guardians: Array<{ guardianId: string }> }>('/patients', {
    name,
    speciesId: dog.id,
    sex: 'female',
    reproductiveStatus: 'intact',
    weightKg: 9,
    newGuardian: { personType: 'individual', name: `Tutora de ${name}`, phonePrimary: '(11) 97777-0000' },
  });
  return { id: patient.id, guardianId: patient.guardians[0]!.guardianId };
}

async function createAppointment(api: Api, patientId: string, guardianId: string, minutesAhead: number, reason: string) {
  const services = await api.get<{ items: Array<{ id: string; key: string }> }>('/services');
  const consulta = services.items.find((service) => service.key === 'consulta')!;
  const professionals = await api.get<{ items: Array<{ id: string; active: boolean }> }>('/professionals');
  const professional = professionals.items.find((item) => item.active)!;
  const slot = laterToday(minutesAhead);
  return api.post<{ id: string }>('/appointments', {
    patientId,
    guardianId,
    professionalId: professional.id,
    serviceId: consulta.id,
    startAt: slot.iso,
    reason,
    allowOverlap: true,
  });
}

async function agendaRow(page: Page, patientName: string) {
  await page.goto('/agenda');
  await settle(page);
  const row = page.locator('li', { hasText: patientName }).first();
  await expect(row).toBeVisible();
  return row;
}

test('cliente novo: cadastra tutor e animal juntos e agenda pela ficha', async ({ page }) => {
  const animal = uniqueName('Pipoca');

  await page.goto('/pacientes');
  await settle(page);
  await page.getByRole('button', { name: 'Novo paciente' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cadastrar um tutor novo agora' }).click();
  await dialog.getByLabel('Nome do tutor').fill(`Tutor de ${animal}`);
  await dialog.getByLabel('Telefone').fill('(11) 96666-1234');
  await dialog.getByLabel('Nome', { exact: true }).fill(animal);
  await dialog.getByLabel('Espécie').selectOption({ label: 'Cão' });
  await expectNoHorizontalOverflow(page);
  await dialog.getByRole('button', { name: 'Cadastrar paciente' }).click();

  await page.waitForURL(/\/pacientes\/[0-9a-f-]{36}$/);
  await expect(page.locator('main h1').first()).toContainText(animal);
  await expect(page.getByText(`Tutor de ${animal}`).first()).toBeVisible();

  await page.getByRole('link', { name: 'Agendar' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText(animal).first()).toBeVisible();
  await form.getByLabel('Serviço').selectOption({ label: 'Consulta clínica' });
  await form.getByLabel('Profissional').selectOption({ index: 1 });
  await form.getByLabel('Data').fill(todayIso(1));
  await form.getByLabel('Horário').fill('16:47');
  await form.getByLabel('Motivo').fill('Vacinação anual');
  await form.getByRole('button', { name: 'Agendar', exact: true }).click();
  await expect(page.getByText('Agendamento criado.').first()).toBeVisible();

  await page.goto('/agenda');
  await settle(page);
  await page.getByRole('button', { name: 'Próximo dia' }).click();
  await settle(page);
  await expect(page.locator('li', { hasText: animal }).first()).toBeVisible();
});

test('check-in com peso abre o atendimento com o motivo como queixa', async ({ page, api }) => {
  const animal = uniqueName('Feijão');
  const patient = await createPatient(api, animal);
  await createAppointment(api, patient.id, patient.guardianId, 90, 'Coceira na orelha');

  const row = await agendaRow(page, animal);
  await row.getByRole('button', { name: 'Check-in' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Peso aferido').fill('9,6');
  await sheet.getByRole('button', { name: 'Confirmar chegada' }).click();

  // a recepção continua na agenda para o próximo cliente; o atendimento fica a um toque
  await expect(page.getByText(/Check-in realizado/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/agenda/);
  await page.locator('li', { hasText: animal }).first().getByRole('link', { name: 'Abrir atendimento' }).click();
  await page.waitForURL(/\/atendimentos\/[0-9a-f-]{36}$/);
  await settle(page);
  await expect(page.getByText(animal).first()).toBeVisible();
  // a recepção não escreve o registro clínico; a queixa aparece no atendimento
  await expect(page.getByText('Coceira na orelha').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('cancela um agendamento e marca falta em outro', async ({ page, api }) => {
  const first = uniqueName('Amendoim');
  const second = uniqueName('Paçoca');
  const a = await createPatient(api, first);
  const b = await createPatient(api, second);
  await createAppointment(api, a.id, a.guardianId, 100, 'Retorno');
  await createAppointment(api, b.id, b.guardianId, 110, 'Banho e tosa');

  const row = await agendaRow(page, first);
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar agendamento' }).click();
  await expect(page.getByText('Agendamento cancelado.').first()).toBeVisible();
  await expect(page.locator('li', { hasText: first }).first()).toContainText(/Cancelado/i);

  const other = await agendaRow(page, second);
  await other.getByRole('button', { name: 'Cancelar' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(/falta/i).check();
  await sheet.getByRole('button', { name: 'Registrar falta' }).click();
  await expect(page.getByText('Falta registrada.').first()).toBeVisible();
});

test('cancelar depois do check-in cancela junto o atendimento aberto', async ({ page, api }) => {
  const animal = uniqueName('Biscoito');
  const patient = await createPatient(api, animal);
  const appointment = await createAppointment(api, patient.id, patient.guardianId, 120, 'Tosse');
  const checkIn = await api.post<{ encounterId: string }>(`/appointments/${appointment.id}/check-in`, {});

  const row = await agendaRow(page, animal);
  await row.getByRole('button', { name: 'Cancelar' }).click();
  const sheet = page.getByRole('dialog');
  // depois da chegada não existe falta, e o aviso diz o que acontece com o atendimento
  await expect(sheet.getByText(/atendimento aberto na chegada também será cancelado/)).toBeVisible();
  await expect(sheet.getByLabel(/falta/i)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Cancelar agendamento' }).click();
  await expect(page.getByText('Agendamento cancelado.').first()).toBeVisible();

  const encounter = await api.get<{ status: string }>(`/encounters/${checkIn.encounterId}`);
  expect(encounter.status).toBe('cancelled');
});

test('remarca pela agenda e o horário muda na lista', async ({ page, api }) => {
  const animal = uniqueName('Nescau');
  const patient = await createPatient(api, animal);
  await createAppointment(api, patient.id, patient.guardianId, 130, 'Revisão');

  const row = await agendaRow(page, animal);
  await row.getByRole('button', { name: 'Remarcar' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('Remarcar').first()).toBeVisible();
  await form.getByLabel('Data').fill(todayIso(2));
  await form.getByLabel('Horário').fill('10:53');
  await form.getByRole('button', { name: 'Salvar novo horário' }).click();
  await expect(page.getByText('Agendamento remarcado.').first()).toBeVisible();

  // a agenda vai para o dia novo e mostra o horário novo
  await settle(page);
  const moved = page.locator('li', { hasText: animal }).first();
  await expect(moved).toContainText('10:53');
});

test('visão da semana mostra o dia cheio e abre o dia com um toque', async ({ page, api }) => {
  const animal = uniqueName('Quindim');
  const patient = await createPatient(api, animal);
  await createAppointment(api, patient.id, patient.guardianId, 140, 'Consulta');

  await page.goto('/agenda');
  await settle(page);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await settle(page);
  await expect(page.getByText(animal).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: new RegExp(animal) }).first().click();
  await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('li', { hasText: animal }).first().getByRole('button', { name: 'Check-in' })).toBeVisible();
});

test('retorno pedido pelo veterinário é agendado pela recepção e sai da lista', async ({ page, apiAs }) => {
  const vet = await apiAs('vet');
  const animal = uniqueName('Retorno');
  const patient = await createPatient(vet, animal);
  const encounter = await vet.post<{ id: string }>('/encounters', {
    patientId: patient.id,
    class: 'outpatient',
    chiefComplaint: 'Otite',
  });
  await vet.post(`/encounters/${encounter.id}/start`);
  await vet.post(`/encounters/${encounter.id}/finish`, {
    followUpDueAt: todayIso(10),
    followUpReason: 'Reavaliar otite',
    minimumContentJustification: 'Teste de retorno',
  });

  await page.goto('/agenda');
  await settle(page);
  // clínica cheia tem centenas de retornos: a recepção acha pelo nome
  await page.getByLabel('Buscar retorno por paciente ou tutor').fill(animal);
  await settle(page);
  const card = page.locator('li', { hasText: animal }).filter({ hasText: 'Reavaliar otite' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Agendar retorno' }).click();

  const form = page.getByRole('dialog');
  await expect(form.getByText('Agendar retorno').first()).toBeVisible();
  await expect(form.getByLabel('Motivo')).toHaveValue('Reavaliar otite');
  await expect(form.getByLabel('Data')).toHaveValue(todayIso(10));
  await form.getByLabel('Profissional').selectOption({ index: 1 });
  await form.getByLabel('Horário').fill('15:37');
  await form.getByRole('button', { name: 'Agendar', exact: true }).click();
  await expect(page.getByText('Agendamento criado.').first()).toBeVisible();

  await expect(page.locator('li', { hasText: animal }).filter({ hasText: 'Agendar retorno' })).toHaveCount(0);
  await expect(page.getByText(`Nenhum retorno para "${animal}"`)).toBeVisible();
});
