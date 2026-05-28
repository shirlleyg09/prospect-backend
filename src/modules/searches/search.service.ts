/**
 * @file search.service.ts
 * @description
 *   Orquestra o ciclo de vida de uma Search:
 *     1. Criação (PENDING) + enfileiramento imediato
 *     2. Execução no worker → chama ProviderService
 *     3. Persistência dos leads via LeadService
 *     4. Atualização de status (PROCESSING → DONE/ERROR)
 *
 *   Nunca executa scraping inline — sempre via fila.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Search, SearchStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PgQueueService } from '../../queue/pg-queue.service';
import { QUEUE_SEARCH_EXECUTE } from '../../queue/queue.constants';
import { LeadService } from '../leads/lead.service';
import { ProviderService } from '../providers/provider.service';
import { CreateSearchDto } from './dto/search.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerService: ProviderService,
    private readonly leadService: LeadService,
    private readonly queue: PgQueueService,
  ) {}

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  async create(teamId: string, userId: string, dto: CreateSearchDto): Promise<Search> {
    const search = await this.prisma.search.create({
      data: {
        teamId,
        createdById: userId,
        name: dto.name,
        niche: dto.niche,
        location: dto.location,
        filters: (dto.filters ?? {}) as object,
        providers: dto.providers ?? [],
        status: SearchStatus.PENDING,
      },
    });

    await this.queue.add(
      QUEUE_SEARCH_EXECUTE,
      { searchId: search.id, teamId, limit: dto.limit },
      { attempts: 2, backoffDelay: 10 },
    );

    this.logger.log(`Search criada id=${search.id} team=${teamId} niche="${dto.niche}"`);
    return search;
  }

  async list(teamId: string, limit = 50) {
    return this.prisma.search.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { _count: { select: { leads: true } } },
    });
  }

  async findById(teamId: string, id: string) {
    const search = await this.prisma.search.findFirst({
      where: { id, teamId },
      include: {
        providerRuns: { orderBy: { startedAt: 'desc' } },
        _count: { select: { leads: true } },
      },
    });
    if (!search) throw new NotFoundException('Search não encontrada');
    return search;
  }

  // ---------------------------------------------------------------------------
  // Ciclo de execução — chamado APENAS pelo worker
  // ---------------------------------------------------------------------------

  async execute(searchId: string, limit?: number): Promise<void> {
    const search = await this.prisma.search.findUniqueOrThrow({ where: { id: searchId } });

    await this.prisma.search.update({
      where: { id: searchId },
      data: { status: SearchStatus.PROCESSING, startedAt: new Date() },
    });

    try {
      const { leads, runs } = await this.providerService.orchestrate({
        teamId: search.teamId,
        searchId: search.id,
        providerNames: search.providers.length ? search.providers : undefined,
        params: {
          niche: search.niche,
          location: search.location,
          filters: search.filters as Record<string, unknown>,
          limit: limit ?? 200,
          locale: 'pt-BR',
        },
      });

      const successfulRuns = runs.filter((r) => r.status === 'success').length;
      this.logger.log(
        `Search ${searchId}: ${leads.length} leads de ${successfulRuns}/${runs.length} providers`,
      );

      const persistResult = await this.leadService.persistBatch(search.teamId, search.id, leads);

      this.logger.log(
        `Search ${searchId} → persistidos: ${persistResult.created} novos, ${persistResult.updated} atualizados`,
      );

      // Atualiza apenas campos existentes no schema para evitar erro Prisma
      await this.prisma.search.update({
        where: { id: searchId },
        data: {
          status: SearchStatus.DONE,
          finishedAt: new Date(),
          totalFound: leads.length,
        },
      });
    } catch (err) {
      this.logger.error(`Search ${searchId} falhou: ${(err as Error).message}`);
      await this.prisma.search.update({
        where: { id: searchId },
        data: {
          status: SearchStatus.ERROR,
          finishedAt: new Date(),
          errorMessage: (err as Error).message,
        },
      });
      throw err; // devolve ao BullMQ para retry
    }
  }
}
