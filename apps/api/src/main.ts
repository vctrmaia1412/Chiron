import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { env } from './config/env';
import { logger, NestPinoLogger } from './common/logger';

export async function createApp(): Promise<NestFastifyApplication> {
  const cfg = env();

  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    genReqId: (req: { headers: Record<string, unknown> }) =>
      (req.headers['x-request-id'] as string) ?? randomUUID(),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: new NestPinoLogger(),
    bufferLogs: false,
  });

  await app.register(fastifyCookie as never);
  await app.register(fastifyHelmet as never, {
    contentSecurityPolicy: false, // a CSP é aplicada pelo web/proxy
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // A sessão viaja em cookie, então a origem permitida é explícita e curta:
  // nada de `*`, que o navegador recusa junto de credenciais de qualquer forma.
  const allowedOrigins = new Set(
    [cfg.PUBLIC_APP_URL, ...(cfg.APP_ENV === 'dev' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])].filter(
      Boolean,
    ),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error('Origem não permitida'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Chiron-Tenant', 'X-Request-Id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  const instance = app.getHttpAdapter().getInstance();

  // request id disponível em todo o ciclo
  instance.addHook('onRequest', (request, reply, done) => {
    const id = String(request.id);
    (request as unknown as { requestId: string }).requestId = id;
    void reply.header('x-request-id', id);
    done();
  });

  // proteção CSRF para credencial por cookie: exige Origin conhecido
  instance.addHook('preHandler', (request, reply, done) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return done();

    const usesCookie = Boolean(request.headers.cookie?.includes(cfg.COOKIE_NAME));
    if (!usesCookie) return done();

    const origin = request.headers.origin;
    if (!origin) return done(); // cliente não-browser
    const allowed = new Set([cfg.PUBLIC_APP_URL, `http://localhost:${cfg.PORT}`]);
    if (![...allowed].some((a) => origin.startsWith(a))) {
      void reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Origem não permitida.',
        requestId: String(request.id),
      });
      return;
    }
    done();
  });

  app.setGlobalPrefix(cfg.API_PREFIX);
  app.enableShutdownHooks();

  return app;
}

async function bootstrap(): Promise<void> {
  const cfg = env();
  const app = await createApp();
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  logger.info({ port: cfg.PORT, prefix: cfg.API_PREFIX, env: cfg.APP_ENV }, 'CHIRON API iniciada');
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error({ err: error }, 'Falha ao iniciar a API');
    process.exit(1);
  });
}
