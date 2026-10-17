import { expect, expectNoHorizontalOverflow, settle, test, uniqueName, type Api } from './fixtures';

/**
 * Ficha do paciente pelo veterinário: documentos gerados ali mesmo e o
 * registro de óbito, que fecha a agenda futura e leva direto ao atestado.
 */
test.use({ role: 'vet' });

async function newPatient(api: Api, prefix: string) {
  const species = await api.get<{ items: Array<{ id: string; code: string }> }>('/species');
  const cat = species.items.find((item) => item.code === 'cat')!;
  const name = uniqueName(prefix);
  const patient = await api.post<{ id: string; guardians: Array<{ guardianId: string }> }>('/patients', {
    name,
    speciesId: cat.id,
    sex: 'female',
    reproductiveStatus: 'spayed',
    weightKg: 4.1,
    newGuardian: { personType: 'individual', name: `Tutora de ${name}`, phonePrimary: '(11) 94444-3333' },
  });
  return { name, id: patient.id, guardianId: patient.guardians[0]!.guardianId };
}

test('óbito: registra, cancela a agenda futura e abre o atestado preenchido', async ({ page, api }) => {
  const patient = await newPatient(api, 'Mimi');
  const services = await api.get<{ items: Array<{ id: string; key: string }> }>('/services');
  const consulta = services.items.find((service) => service.key === 'consulta')!;
  const start = new Date();
  start.setDate(start.getDate() + 5);
  start.setHours(11, 17, 0, 0);
  const future = await api.post<{ id: string }>('/appointments', {
    patientId: patient.id,
    guardianId: patient.guardianId,
    professionalId: api.professionalId,
    serviceId: consulta.id,
    startAt: start.toISOString(),
    allowOverlap: true,
  });

  await page.goto(`/pacientes/${patient.id}`);
  await settle(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Registrar óbito' }).click();
  const death = page.getByRole('dialog');
  await death.getByLabel('Causa provável').fill('Insuficiência renal crônica');
  await death.getByLabel('Destino do corpo').selectOption('cremation');
  await death.getByRole('button', { name: 'Registrar óbito' }).click();
  await expect(page.getByText(/Óbito registrado\. Agendamentos futuros cancelados/).first()).toBeVisible();

  // o próximo passo já vem aberto: atestado com data e causa preenchidas
  const certificate = page.getByRole('dialog');
  await expect(certificate.getByLabel('Modelo')).toHaveValue('death_certificate');
  await expect(certificate.getByLabel('Causa provável')).toHaveValue('Insuficiência renal crônica');
  const popup = page.waitForEvent('popup');
  await certificate.getByRole('button', { name: 'Gerar PDF' }).click();
  await (await popup).close();
  await expect(page.getByText('Documento gerado e arquivado.').first()).toBeVisible();

  await expect(page.getByText(/Óbito registrado em/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atender agora' })).toHaveCount(0);
  const appointment = await api.get<{ status: string }>(`/appointments/${future.id}`);
  expect(appointment.status).toBe('cancelled');
});

test('gera atestado de saúde pela ficha', async ({ page, api }) => {
  const patient = await newPatient(api, 'Nina');
  await page.goto(`/pacientes/${patient.id}`);
  await settle(page);
  await page.getByRole('button', { name: 'Atestado, termo ou declaração' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Modelo').selectOption('health_certificate');
  await sheet.getByLabel('Finalidade').fill('Viagem');
  const popup = page.waitForEvent('popup');
  await sheet.getByRole('button', { name: 'Gerar PDF' }).click();
  await (await popup).close();
  await expect(page.getByText('Documento gerado e arquivado.').first()).toBeVisible();

  await page.goto(`/documentos?pacienteId=${patient.id}`);
  await settle(page);
  await expect(page.locator('main h1').first()).toContainText(`Documentos de ${patient.name}`);
  await expect(page.getByText(/Atestado de saúde/).first()).toBeVisible();
});

test('PDF do prontuário completo sai pela ficha', async ({ page, api }) => {
  const patient = await newPatient(api, 'Tom');
  await page.goto(`/pacientes/${patient.id}`);
  await settle(page);
  await page.getByRole('button', { name: 'Atestado, termo ou declaração' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Modelo').selectOption('medical_record');
  const popup = page.waitForEvent('popup');
  await sheet.getByRole('button', { name: 'Gerar PDF' }).click();
  await (await popup).close();
  await expect(page.getByText('Documento gerado e arquivado.').first()).toBeVisible();
});
