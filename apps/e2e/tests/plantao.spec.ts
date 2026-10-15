import { expect, isMobile, settle, test, uniqueName, visibleButton, type Api } from './fixtures';

/**
 * Plantão: o paciente chegou para um veterinário e quem atende é outro. Quem
 * não é o responsável vê de quem é o atendimento e assume com um toque, em
 * vez de descobrir na hora de assinar. O técnico adianta a triagem sem virar
 * o responsável.
 */
async function encounterFor(vet: Api, prefix: string) {
  const species = await vet.get<{ items: Array<{ id: string; code: string }> }>('/species');
  const dog = species.items.find((item) => item.code === 'dog')!;
  const name = uniqueName(prefix);
  const patient = await vet.post<{ id: string }>('/patients', {
    name,
    speciesId: dog.id,
    sex: 'male',
    reproductiveStatus: 'neutered',
    weightKg: 18,
    newGuardian: { personType: 'individual', name: `Tutor de ${name}`, phonePrimary: '(11) 93333-1111' },
  });
  const encounter = await vet.post<{ id: string }>('/encounters', {
    patientId: patient.id,
    class: 'outpatient',
    chiefComplaint: 'Mancando da pata traseira',
  });
  return { name, encounterId: encounter.id };
}

test.describe('veterinária de plantão', () => {
  test.use({ role: 'vet2' });

  test('vê de quem é o atendimento, assume e pode finalizar', async ({ page, apiAs }) => {
    const vet = await apiAs('vet');
    const { encounterId } = await encounterFor(vet, 'Plantão');

    await page.goto(`/atendimentos/${encounterId}`);
    await settle(page);
    await expect(page.getByText(/Atendimento de .*Para finalizar e assinar, assuma o atendimento/).first()).toBeVisible();
    await expect(visibleButton(page, 'Finalizar')).toHaveCount(0);

    await visibleButton(page, 'Assumir').click();
    await expect(page.getByText('Você assumiu o atendimento.').first()).toBeVisible();
    await expect(visibleButton(page, 'Finalizar')).toBeVisible();
  });
});

test.describe('técnico', () => {
  test.use({ role: 'tecnico' });

  test('registra sinais sem a ação de iniciar nem finalizar', async ({ page, apiAs }) => {
    const vet = await apiAs('vet');
    const { encounterId } = await encounterFor(vet, 'Triagem');

    await page.goto(`/atendimentos/${encounterId}`);
    await settle(page);
    await expect(visibleButton(page, 'Iniciar')).toHaveCount(0);
    await expect(visibleButton(page, 'Finalizar')).toHaveCount(0);
    // sinais: barra inferior no celular, cartão de sinais vitais no computador
    if (isMobile(page)) await expect(visibleButton(page, 'Sinais')).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Registrar' }).first()).toBeVisible();
  });
});
