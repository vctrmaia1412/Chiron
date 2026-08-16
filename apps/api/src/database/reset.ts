import { Client } from 'pg';
import { env } from '../config/env';

/**
 * Recria o banco do zero em ambiente local. Nunca roda em produção.
 * Fluxo: derruba os schemas da aplicação, reaplica migrações e dados de
 * referência. O seed de demonstração é um passo separado (`db:seed`).
 */
const SCHEMAS = [
  'billing',
  'inventory',
  'documents',
  'immunization',
  'lab',
  'clinical',
  'scheduling',
  'registry',
  'audit',
  'iam',
  'platform',
];

async function main(): Promise<void> {
  const cfg = env();
  if (cfg.APP_ENV === 'prod' || cfg.NODE_ENV === 'production') {
    throw new Error('reset não pode rodar em produção.');
  }

  const url = cfg.DATABASE_MIGRATION_URL ?? cfg.DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const schema of SCHEMAS) {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    console.log('Schemas removidos.');
  } finally {
    await client.end();
  }

  const { runMigrations } = await import('./migrate');
  const { applied } = await runMigrations();
  console.log(`${applied.length} migração(ões) aplicada(s).`);

  const { syncReferenceData } = await import('./reference-data');
  await syncReferenceData();
  console.log('Dados de referência sincronizados.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Falha no reset:', error);
    process.exit(1);
  });
