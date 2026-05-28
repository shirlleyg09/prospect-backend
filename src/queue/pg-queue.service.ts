/**
 * @file pg-queue.service.ts
 * @description
 *   Serviço de filas usando pg-boss (Postgres). Substitui BullMQ/Redis.
 *   Usa o mesmo banco PostgreSQL do projeto — sem infraestrutura extra.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PgBoss } = require('pg-boss');

export interface JobOpts {
  attempts?: number;
  backoffDelay?: number; // segundos
}

@Injectable()
export class PgQueueService implements OnModuleInit, OnModuleDestroy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private boss: any;
  private readonly logger = new Logger(PgQueueService.name);

  constructor(private readonly config: ConfigService) {
    this.boss = new PgBoss({
      connectionString: this.config.get<string>('DATABASE_URL'),
      // Retém jobs completos por 24h e falhos por 7 dias
      deleteAfterSeconds: 86400,
      archiveCompletedAfterSeconds: 86400,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.boss.on('error', (err: any) => this.logger.error('pg-boss error', err));
  }

  async onModuleInit() {
    await this.boss.start();
    this.logger.log('pg-boss iniciado (fila via Postgres)');
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true });
  }

  /**
   * Adiciona um job à fila. Cria a fila se não existir.
   */
  async add<T extends object>(queue: string, data: T, opts?: JobOpts): Promise<string | null> {
    await this.ensureQueue(queue);
    return this.boss.send(queue, data, {
      retryLimit: opts?.attempts ?? 1,
      retryDelay: opts?.backoffDelay ?? 5,
      expireInSeconds: 3600,
    });
  }

  /**
   * Adiciona múltiplos jobs à fila de uma vez (batch). Cria a fila se não existir.
   */
  async addBulk<T extends object>(
    queue: string,
    jobs: Array<{ data: T; opts?: JobOpts }>,
  ): Promise<void> {
    if (jobs.length === 0) return;
    await this.ensureQueue(queue);
    // pg-boss v10: insert(name, jobs[]) — name separado do array
    await this.boss.insert(
      queue,
      jobs.map((j) => ({
        data: j.data,
        retryLimit: j.opts?.attempts ?? 1,
        retryDelay: j.opts?.backoffDelay ?? 5,
        expireInSeconds: 3600,
      })),
    );
  }

  /**
   * Registra um worker para processar jobs de uma fila.
   * Cria a fila automaticamente se ainda não existir.
   */
  async work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
    opts: { concurrency?: number; teamSize?: number } = {},
  ): Promise<void> {
    // pg-boss v10 exige que a fila exista antes de registrar worker
    await this.boss.createQueue(queue);

    // pg-boss v10 passa um array de jobs para o handler
    await this.boss.work(
      queue,
      { teamSize: opts.teamSize ?? opts.concurrency ?? 1, teamConcurrency: opts.concurrency ?? 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (jobs: any) => {
        const jobArray: any[] = Array.isArray(jobs) ? jobs : [jobs];
        await Promise.all(jobArray.map((job) => handler(job.data as T)));
      },
    );
  }

  /**
   * Garante que a fila existe antes de publicar jobs.
   */
  private async ensureQueue(queue: string): Promise<void> {
    await this.boss.createQueue(queue);
  }
}
