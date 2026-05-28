/**
 * @file queue.module.ts
 * @description
 *   Módulo de workers. Registra os processors que consomem as filas pg-boss.
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../modules/ai/ai.module';
import { LeadsModule } from '../modules/leads/leads.module';
import { SearchesModule } from '../modules/searches/searches.module';
import { AIAnalyzeProcessor } from './ai-analyze.processor';
import { SearchExecuteProcessor } from './search-execute.processor';

@Module({
  imports: [
    DatabaseModule,
    SearchesModule,
    LeadsModule,
    AIModule,
  ],
  providers: [SearchExecuteProcessor, AIAnalyzeProcessor],
})
export class QueueModule {}
