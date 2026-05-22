import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../database/database.module';
import { QUEUE_SEARCH_EXECUTE } from '../../queue/queue.constants';
import { AutomationService } from './automation.service';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: QUEUE_SEARCH_EXECUTE }),
  ],
  providers: [AutomationService],
})
export class AutomationModule {}
