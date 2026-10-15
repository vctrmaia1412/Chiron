import { expect, expectNoHorizontalOverflow, settle, test, uniqueName, type Api } from './fixtures';

/**
 * O exame do começo ao fim pelo veterinário: o laudo chega em PDF, é anexado
 * ao resultado, revisado e, quando o laboratório corrige, retificado sem
 * perder a versão anterior. Pedido errado é cancelado com motivo.
 */
test.use({ role: 'vet' });

/** PDF mínimo: o servidor confere o começo do arquivo contra o tipo declarado. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n');

async function patientWithOrder(api: Api) {
  const species = await api.get<{ items: Array<{ id: string; code: string }> }>('/species');
  const dog = species.items.find((item) => item.code === 'dog')!;
  const name = uniqueName('Lab');
  const patient = await api.post<{ id: string }>('/patients', {
    name,
    speciesId: dog.id,
    sex: 'male',
    reproductiveStatus: 'intact',
    weightKg: 12,
    newGuardian: { personType: 'individual', name: `Tutor de ${name}`, phonePrimary: '(11) 95555-2222' },
  });
  const catalog = await api.get<{ items: Array<{ id: string; name: string }> }>('/exam-catalog');
  const exam = catalog.items[0]!;
  const order = await api.post<{ id: string }>('/exam-orders', {
    patientId: patient.id,
    items: [{ examCatalogId: exam.id }],
    clinicalInfo: 'Apatia há 3 dias',
  });
  return { name, patientId: patient.id, orderId: order.id, examName: exam.name };
}

test('resultado com laudo em PDF, revisão e retificação', async ({ page, api }) => {
  const { name, patientId, orderId, examName } = await patientWithOrder(api);

  await page.goto(`/exames?pacienteId=${patientId}`);
  await settle(page);
  await expect(page.locator('main h1').first()).toContainText(`Exames de ${name}`);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /pedido nº/ }).first().click();
  await page.getByRole('button', { name: 'Lançar resultado' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Conclusão').fill('Anemia discreta, sem alteração de plaquetas.');
  await sheet.locator('input[type="file"]').setInputFiles({ name: 'laudo.pdf', mimeType: 'application/pdf', buffer: PDF });
  await sheet.getByRole('button', { name: 'Salvar resultado' }).click();
  await expect(page.getByText('Resultado lançado.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver laudo' }).first()).toBeVisible();

  // o laudo foi para o armazenamento de verdade e volta íntegro pelo link assinado
  const order = await api.get<{ items: Array<{ result: { documentId: string | null } | null }> }>(`/exam-orders/${orderId}`);
  const documentId = order.items[0]!.result!.documentId!;
  const { url } = await api.get<{ url: string }>(`/documents/${documentId}/download`);
  const file = await api.request.get(url);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText('Resultado revisado.').first()).toBeVisible();

  // laboratório mandou correção depois da revisão
  await page.getByRole('button', { name: 'Retificar resultado' }).click();
  const amend = page.getByRole('dialog');
  await expect(amend.getByText(/Já existe um resultado liberado/)).toBeVisible();
  await amend.getByLabel('Conclusão').fill('Anemia discreta. Corrigido pelo laboratório: plaquetas baixas.');
  await amend.getByRole('button', { name: 'Salvar resultado' }).click();
  await expect(page.getByText(/Resultado retificado/).first()).toBeVisible();
  await expect(page.getByText(/plaquetas baixas/).first()).toBeVisible();
  // o laudo anexado continua valendo depois da retificação
  await expect(page.getByRole('button', { name: 'Ver laudo' }).first()).toBeVisible();
  expect(examName).toBeTruthy();
});

test('pedido sem resultado é cancelado com motivo', async ({ page, api }) => {
  const { patientId } = await patientWithOrder(api);

  await page.goto(`/exames?pacienteId=${patientId}`);
  await settle(page);
  await page.getByRole('button', { name: /pedido nº/ }).first().click();
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Motivo').fill('Pedido em duplicidade');
  await sheet.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByText('Pedido de exame cancelado.').first()).toBeVisible();
});
