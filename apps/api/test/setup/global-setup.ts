import { applyTestEnv, recreateTestDatabase } from './test-database';

/**
 * Sobe um banco limpo uma vez por execução: recria o database, aplica as
 * migrações, sincroniza dados de referência e roda o seed de demonstração
 * (que já cria dois tenants, exatamente o cenário do teste de isolamento).
 */
export async function setup(): Promise<void> {
  applyTestEnv();
  await recreateTestDatabase();

  const { runMigrations } = await import('../../src/database/migrate');
  await runMigrations(process.env.DATABASE_MIGRATION_URL);

  const { syncReferenceData } = await import('../../src/database/reference-data');
  await syncReferenceData(process.env.DATABASE_MIGRATION_URL);

  const { seedDemoData } = await import('../../src/database/seed-data');
  await seedDemoData({ connectionString: process.env.DATABASE_MIGRATION_URL, quiet: true });
}

export async function teardown(): Promise<void> {
  // O banco de teste fica de pé para inspeção após a execução.
}
