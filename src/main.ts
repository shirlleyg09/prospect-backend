import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { EventEmitter } from 'events';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

// Aumenta o limite de listeners para EventEmitter — necessário porque
// o axios + Puppeteer + BullMQ + Prisma juntos abrem muitas conexões TLS
// em paralelo, e cada uma adiciona um error listener. Default 10 é baixo.
EventEmitter.defaultMaxListeners = 50;

// PROTEÇÃO: capturar erros não tratados pra processo Node não cair.
// Sem isso, qualquer rejection no Puppeteer/Bull/Axios derruba o backend inteiro.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException] Backend evitou crash:', err.message);
  // eslint-disable-next-line no-console
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection] Backend evitou crash:', reason);
});

async function bootstrap(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[bootstrap] Passo 1: iniciando NestFactory.create...');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  // eslint-disable-next-line no-console
  console.log('[bootstrap] Passo 2: NestFactory.create OK');

  const config = app.get(ConfigService);

  // Segurança
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Prefixo de API
  app.setGlobalPrefix('api/v1');

  // Shutdown hooks do Prisma
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  const port = config.get<number>('PORT', 3001);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] Passo 3: tentando escutar na porta ${port}...`);

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] Passo 4: 🚀 Prospect API rodando em http://0.0.0.0:${port}/api/v1`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] FALHA FATAL — processo continuando para debug:', err);
});
