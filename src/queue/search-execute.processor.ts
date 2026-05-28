/**
 * @file search-execute.processor.ts
 * @description
 *   Worker que consome a fila `search.execute`. Cada job invoca
 *   `SearchService.execute(searchId)` — a lógica de orquestração e persistência
 *   mora no service, o worker é apenas a casca.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from '../modules/searches/search.service';
import { PgQueueService } from './pg-queue.service';
import { QUEUE_SEARCH_EXECUTE } from './queue.constants';

interface ExecuteSearchJob {
  searchId: string;
  teamId: string;
  limit?: number;
}

@Injectable()
export class SearchExecuteProcessor implements OnModuleInit {
  private readonly logger = new Logger(SearchExecuteProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly queue: PgQueueService,
  ) {}

  async onModuleInit() {
    await this.queue.work<ExecuteSearchJob>(
      QUEUE_SEARCH_EXECUTE,
      (data) => this.process(data),
      { concurrency: 3 },
    );
    this.logger.log(`Worker registrado: ${QUEUE_SEARCH_EXECUTE}`);
  }

  private async process(data: ExecuteSearchJob): Promise<void> {
    this.logger.log(`Iniciando execute-search id=${data.searchId}`);
    await this.searchService.execute(data.searchId, data.limit);
  }
}
