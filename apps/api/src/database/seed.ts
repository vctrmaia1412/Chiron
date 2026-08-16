import { seedDemoData } from './seed-data';

/** Entrada de linha de comando do seed de demonstração (`pnpm db:seed`). */
seedDemoData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exit(1);
  });
