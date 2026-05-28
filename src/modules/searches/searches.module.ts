import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { LeadsModule } from '../leads/leads.module';
import { ProvidersModule } from '../providers/providers.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [DatabaseModule, ProvidersModule, LeadsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchesModule {}
