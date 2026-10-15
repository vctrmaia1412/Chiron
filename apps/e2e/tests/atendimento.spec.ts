import { expect, expectNoHorizontalOverflow, isMobile, settle, test, uniqueName, visibleButton, type Api } from './fixtures';

/**
 * A consulta inteira pelo veterinário, numa ficha nova criada pelo teste:
 * nada depende do estado do seed além dos catálogos de fábrica.
 */
test.use({ role: 'vet' });

async function newEncounter(api: Api, complaint: string) {
  const species = await api.get<{ items: Array<{ id: string; code: string }> }>('/species');
  const dog = species.items.find((item) => item.code === 'dog')!;
  const name = uniqueName('Thor');
  const patient = await api.post<{ id: string }>('/patients', {
    name,
    speciesId: dog.id,
    sex: 'male',
    reproductiveStatus: 'neutered',
    weightKg: 24.5,
    newGuardian: { personType: 'individual', name: `Marina de ${name}`, phonePrimary: '(11) 98812-4471' },
  });
  const services = await api.get<{ items: Array<{ id: string; key: string }> }>('/services');
  const consulta = services.items.find((service) => service.key === 'consulta')!;
  const encounter = await api.post<{ id: string }>('/encounters', {
    patientId: patient.id,
    serviceId: consulta.id,
    class: 'outpatient',
    chiefComplaint: complaint,
  });
  return { name, patientId: patient.id, encounterId: encounter.id };
}

test('consulta completa: registro, diagnóstico, receita assinada, vacina e finalização', async ({ page, api }) => {
  const { name, encounterId } = await newEncounter(api, 'Coçando a orelha esquerda há 5 dias, balança a cabeça.');

  await page.goto(`/atendimentos/${encounterId}`);
  await settle(page);
  await expect(page.getByText('Registro clínico').first()).toBeVisible();
  await expect(page.locator('#note-chief_complaint')).toHaveValue(/Coçando a orelha/);
  await expect(page.getByText('Começar com o modelo').first()).toContainText('Otite externa');
  await expectNoHorizontalOverflow(page);

  // modelo pelo atalho de barra
  const history = page.locator('#note-history');
  await history.click();
  await history.pressSequentially('/oti', { delay: 30 });
  await expect(page.getByRole('option').first()).toContainText('/otite');
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-assessment')).toHaveValue(/Otite externa/);

  // exame físico normal com um achado
  await page.getByRole('button', { name: 'Exame normal' }).click();
  const exam = page.getByRole('dialog');
  await exam.locator('li', { hasText: 'Ouvidos' }).getByRole('button', { name: 'Alterado' }).click();
  await exam.getByLabel('Achado em Ouvidos').fill('conduto esquerdo com secreção ceruminosa');
  await exam.getByRole('button', { name: /Inserir no exame físico/ }).click();
  await expect(page.locator('#note-physical_exam')).toHaveValue(/Ouvidos \(alterado\): conduto esquerdo/);
  await expect(page.getByText('salvo').first()).toBeVisible();

  // diagnóstico do catálogo, levado para os problemas
  await visibleButton(page, 'Diagnóstico').click();
  const diagnosis = page.getByRole('dialog');
  await diagnosis.locator('#diagnosis-search').fill('otite');
  await diagnosis.getByRole('button', { name: /^Otite externa/ }).first().click();
  await diagnosis.getByRole('button', { name: 'Crônico' }).click();
  await diagnosis.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Diagnóstico registrado e incluído nos problemas.')).toBeVisible();

  // receita: rascunho, assinatura e PDF
  await page.getByRole('button', { name: 'Nova receita' }).first().click();
  const rx = page.getByRole('dialog');
  await rx.locator('input[id$="-drug"]').fill('Otológico com gentamicina');
  await rx.locator('input[id$="-dose"]').fill('4');
  await rx.getByLabel('Unidade da dose').selectOption('drop');
  await rx.getByRole('checkbox', { name: 'por kg' }).uncheck();
  await rx.locator('select[id$="-route"]').selectOption('otic');
  await rx.getByRole('button', { name: '12 h' }).click();
  await rx.getByRole('button', { name: '7 d' }).click();
  await expect(rx.getByText(/4 gotas · otológica · a cada 12 h · por 7 dias/)).toBeVisible();
  await rx.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByText('Receita criada como rascunho').first()).toBeVisible();
  await page.getByRole('button', { name: 'Assinar' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar e assinar' }).click();
  await expect(page.getByText(/Receita assinada/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar PDF' }).first()).toBeVisible();

  // vacina pelo protocolo da espécie
  await page.getByRole('button', { name: 'Vacina', exact: true }).locator('visible=true').first().click();
  const vaccine = page.getByRole('dialog');
  await vaccine.getByRole('button', { name: /V8\/V10/ }).click();
  await expect(vaccine.getByLabel(/Vacina/).first()).toHaveValue('V8/V10 (polivalente)');
  await vaccine.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/Vacina registrada/).first()).toBeVisible();

  // finalizar com retorno e mensagem ao tutor
  await visibleButton(page, 'Finalizar').click();
  const finish = page.getByRole('dialog');
  await expect(finish.getByText(/lacunas "__"/)).toBeVisible();
  await finish.getByRole('button', { name: '15 dias' }).click();
  await finish.getByRole('button', { name: 'Finalizar e assinar' }).click();
  await expect(page.getByRole('dialog').getByText('Atendimento finalizado')).toBeVisible();
  const whatsapp = page.getByRole('link', { name: 'Enviar orientações pelo WhatsApp' });
  await expect(whatsapp).toHaveAttribute('href', /wa\.me\/5511988124471/);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await expect(page.getByText('Finalizado').locator('visible=true').first()).toBeVisible();

  // o que foi feito aparece no resumo do próximo atendimento
  const next = await api.post<{ id: string }>('/encounters', {
    patientId: (await api.get<{ patient: { id: string } }>(`/encounters/${encounterId}`)).patient.id,
    class: 'outpatient',
    chiefComplaint: 'Retorno',
  });
  await page.goto(`/atendimentos/${next.id}`);
  await settle(page);
  await expect(page.getByText(/1 problema/).first()).toBeVisible();
  await expect(page.getByText(name).locator('visible=true').first()).toBeVisible();
});

test('celular: sai do atendimento, consulta e volta sem perder nada', async ({ page, api }) => {
  test.skip(!isMobile(page), 'navegação própria do celular');
  const { name, encounterId } = await newEncounter(api, 'Vômito desde ontem');
  await api.post(`/encounters/${encounterId}/start`);

  await page.goto(`/atendimentos/${encounterId}`);
  await settle(page);
  const history = page.locator('#note-history');
  await history.fill('Comeu lixo ontem à noite.');

  // consulta o histórico sem sair
  await page.getByRole('button', { name: 'Histórico' }).click();
  await expect(page.getByRole('dialog').getByText(`Histórico de ${name}`)).toBeVisible();
  await page.getByRole('tab', { name: 'Consultas' }).click();
  await page.keyboard.press('Escape');

  // sai pelo menu para outra tela; o texto foi gravado
  await page.getByRole('navigation', { name: 'Ações do atendimento' }).getByRole('button', { name: 'Mais' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Exames', exact: true }).click();
  await page.waitForURL('**/exames');
  await settle(page);

  // volta pelo atalho e encontra o texto
  await page.getByRole('link', { name: new RegExp(`Em atendimento: ${name}`) }).click();
  await page.waitForURL(`**/atendimentos/${encounterId}`);
  await settle(page);
  await expect(page.locator('#note-history')).toHaveValue('Comeu lixo ontem à noite.');

  // botão voltar
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(`/atendimentos/${encounterId}`));
});
