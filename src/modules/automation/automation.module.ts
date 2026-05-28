import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../database/database.module';
import { AutomationService } from './automation.service';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  providers: [AutomationService],
})
export class AutomationModule {}
