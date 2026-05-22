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
 * - Inicia conexão em background no onModuleInit (fire-and-forget)
 *   para não bloquear o startup do NestJS/Railway
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

  // Fire-and-forget: não bloqueia o startup
  onModuleInit(): void {
    this.connectWithRetry().catch((err) =>
      this.logger.error(`Falha final na conexão Prisma: ${(err as Error).message}`),
    );
  }

  private async connectWithRetry(): Promise<void> {
    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Prisma $connect timeout após ${ms}ms`)), ms),
      );

    let retries = 5;
    let delay = 2000;

    while (retries > 0) {
      try {
        await Promise.race([this.$connect(), timeout(8000)]);
        this.logger.log('Prisma conectado com sucesso');
        return;
      } catch (err) {
        retries--;
        this.logger.warn(
          `Prisma falhou ao conectar. Tentativas restantes: ${retries}. Erro: ${(err as Error).message}`,
        );
        if (retries === 0) {
          this.logger.error(
            'Prisma não conseguiu conectar após todas as tentativas. Continuando sem conexão pré-estabelecida.',
          );
          return;
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 10_000); // backoff exponencial até 10s
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
