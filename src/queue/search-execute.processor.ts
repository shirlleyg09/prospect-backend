/**
 * @file search-execute.processor.ts
 * @description
 *   Worker BullMQ que consome a fila `search.execute`. Cada job invoca
 *   `SearchService.execute(searchId)` — a lógica de orquestração e persistência
 *   mora no service, o worker é apenas a casca.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SearchService } from '../modules/searches/search.service';
import { QUEUE_SEARCH_EXECUTE } from './queue.constants';

interface ExecuteSearchJob {
  searchId: string;
  teamId: string;
  limit?: number;
}

@Processor(QUEUE_SEARCH_EXECUTE, {
  concurrency: 3, // ajuste conforme capacidade dos providers
})
export class SearchExecuteProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchExecuteProcessor.name);

  constructor(private readonly searchService: SearchService) {
    super();
  }

  async process(job: Job<ExecuteSearchJob>): Promise<void> {
    this.logger.log(`Iniciando execute-search id=${job.data.searchId} attempt=${job.attemptsMade + 1}`);
    await this.searchService.execute(job.data.searchId, job.data.limit);
  }
}
