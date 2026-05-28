import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AIModule } from '../ai/ai.module';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [DatabaseModule, AIModule],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadsModule {}
