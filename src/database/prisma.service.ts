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
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Prisma conectado');
        return;
      } catch (err) {
        retries--;
        this.logger.warn(`Prisma falhou ao conectar. Tentativas restantes: ${retries}. Erro: ${err}`);
        if (retries === 0) {
          this.logger.error('Prisma não conseguiu conectar após 5 tentativas. Continuando sem DB...');
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
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
