import { createServer } from 'node:http';
import { Pool } from 'pg';
import { adminConnectionString, config } from './config';
import { logger } from './logger';
import { countPending, relayOnce } from './outbox-relay';
import { SCHEDULED_JOBS, runJob } from './jobs';

/**
 * Worker do CHIRON.
 *
 * Duas responsabilidades: entregar os eventos da outbox e rodar as tarefas
 * que dependem do relógio. Usa o papel administrativo do banco, único com
 * leitura cross-tenant, justamente porque precisa varrer todas as
 * organizações. Nenhuma requisição de usuário passa por este processo.
 */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: adminConnectionString, max: 4 });
  pool.on('error', (error) => logger.error({ err: error }, 'Erro inesperado no pool do worker'));

  let running = true;
  let lastRelayAt = 0;
  let lastRelayError: string | null = null;

  // Health check separado da API: orquestrador precisa enxergar o worker.
  const health = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', uptime: Math.round(process.uptime()) }));
      return;
    }
    if (request.url === '/ready') {
      void countPending(pool)
        .then((counts) => {
          const healthy = Date.now() - lastRelayAt < config.WORKER_POLL_MS * 10;
          response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              status: healthy ? 'ok' : 'degraded',
              outbox: counts,
              lastRelayError,
            }),
          );
        })
        .catch(() => {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ status: 'degraded', checks: { database: false } }));
        });
      return;
    }
    response.writeHead(404).end();
  });
  health.listen(config.WORKER_HEALTH_PORT);

  const timers: ReturnType<typeof setInterval>[] = [];
  for (const job of SCHEDULED_JOBS) {
    void runJob(pool, job);
    timers.push(setInterval(() => void runJob(pool, job), job.intervalMs));
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando worker');
    running = false;
    for (const timer of timers) clearInterval(timer);
    health.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info(
    { pollMs: config.WORKER_POLL_MS, batch: config.WORKER_BATCH_SIZE, healthPort: config.WORKER_HEALTH_PORT },
    'Worker CHIRON iniciado',
  );

  while (running) {
    try {
      const result = await relayOnce(pool);
      lastRelayAt = Date.now();
      lastRelayError = null;
      if (result.processed > 0 || result.failed > 0) {
        logger.info(result, 'Lote da outbox processado');
      }
      // Sem trabalho, espera o intervalo; com trabalho, volta logo ao laço.
      if (result.processed === 0) await sleep(config.WORKER_POLL_MS);
    } catch (error) {
      lastRelayError = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, 'Falha no relay da outbox');
      await sleep(config.WORKER_POLL_MS * 3);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.error({ err: error }, 'Worker encerrado por falha');
  process.exit(1);
});
