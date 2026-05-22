import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 * - Conecta no onModuleInit
 * - Desconecta no onModuleDestroy
 * - Expõe `enableShutdownHooks` para NestJS cortar gracefully
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Prisma $connect timeout após ${ms}ms`)), ms),
      );

    let retries = 3;
    while (retries > 0) {
      try {
        await Promise.race([this.$connect(), timeout(8000)]);
        this.logger.log('Prisma conectado');
        return;
      } catch (err) {
        retries--;
        this.logger.warn(`Prisma falhou. Tentativas restantes: ${retries}. ${err}`);
        if (retries === 0) {
          this.logger.error('Prisma não conectou. App continua sem DB pré-conectado.');
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
