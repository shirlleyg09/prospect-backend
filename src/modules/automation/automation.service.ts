/**
 * @file automation.service.ts
 * @description
 *   Captação contínua: por time, roda periodicamente as "saved searches"
 *   marcadas como recorrentes e detecta novos leads desde a última rodada.
 *
 *   Usa @nestjs/schedule para cron interno. Em deploy multi-instância,
 *   usar BullMQ repeatable jobs ou um lock distribuído (Redis setnx).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SearchStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PgQueueService } from '../../queue/pg-queue.service';
import { QUEUE_SEARCH_EXECUTE } from '../../queue/queue.constants';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PgQueueService,
  ) {}

  /**
   * Roda a cada 6h. Busca saved searches marcadas como recorrentes
   * (filters.recurring = true) e re-enfileira se já se passou o intervalo.
   *
   * Considera uma busca "vencida" se a última execução foi há mais de
   * filters.intervalHours (padrão 24h).
   */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'continuous-capture' })
  async runContinuousCapture(): Promise<void> {
    this.logger.log('Iniciando ciclo de captação contínua');

    const searches = await this.prisma.search.findMany({
      where: {
        status: { in: [SearchStatus.DONE, SearchStatus.ERROR] },
        filters: { path: ['recurring'], equals: true },
      },
    });

    let enqueued = 0;
    for (const s of searches) {
      const filters = s.filters as Record<string, unknown>;
      const intervalHours = Number(filters.intervalHours ?? 24);
      const lastRun = s.finishedAt?.getTime() ?? 0;
      const shouldRun = Date.now() - lastRun >= intervalHours * 3600 * 1000;

      if (!shouldRun) continue;

      // Clona a busca — nova Search com mesma config, status PENDING
      const clone = await this.prisma.search.create({
        data: {
          teamId: s.teamId,
          createdById: s.createdById,
          name: `${s.name} (auto ${new Date().toISOString().slice(0, 10)})`,
          niche: s.niche,
          location: s.location,
          filters: s.filters as object,
          providers: s.providers,
          status: SearchStatus.PENDING,
        },
      });

      await this.queue.add(
        QUEUE_SEARCH_EXECUTE,
        { searchId: clone.id, teamId: clone.teamId },
        { attempts: 2 },
      );

      enqueued++;
    }

    this.logger.log(`Captação contínua: ${enqueued} buscas re-enfileiradas`);
  }
}
