import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import {
  QUEUE_AI_ANALYZE,
  QUEUE_SEARCH_EXECUTE,
} from '../../queue/queue.constants';
import { LeadsModule } from '../leads/leads.module';
import { ProvidersModule } from '../providers/providers.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    DatabaseModule,
    ProvidersModule,
    LeadsModule,
    BullModule.registerQueue(
      { name: QUEUE_SEARCH_EXECUTE },
      { name: QUEUE_AI_ANALYZE },
    ),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchesModule {}
