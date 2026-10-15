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
