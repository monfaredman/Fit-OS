import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getConfig } from '@gymos/config';
import { AppModule } from './app.module.js';
import { AppExceptionFilter } from './app-exception.filter.js';
import { ZodExceptionFilter } from './zod-exception.filter.js';
import { getLogger } from './logging/logger.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';

async function bootstrap(): Promise<void> {
  const config = getConfig();
  const log = getLogger();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
        const h = req.headers['x-request-id'];
        if (typeof h === 'string' && h.trim()) return h.trim();
        if (Array.isArray(h) && h[0]) return h[0];
        return randomUUID();
      },
    }),
    { bufferLogs: true },
  );

  app.useLogger(new PinoLoggerService());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });

  // Order matters: the Zod filter is more specific and must be registered last
  // so Nest evaluates it first.
  app.useGlobalFilters(new AppExceptionFilter(), new ZodExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('GymOS API')
    .setDescription('Gym management for the Iranian market. Money is integer Rial.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  log.info({ port: config.PORT, docs: `http://localhost:${config.PORT}/docs` }, 'GymOS API ready');
}

bootstrap().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
