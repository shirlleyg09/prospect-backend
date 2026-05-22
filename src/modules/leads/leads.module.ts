import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { QUEUE_AI_ANALYZE } from '../../queue/queue.constants';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: QUEUE_AI_ANALYZE }),
  ],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadsModule {}
