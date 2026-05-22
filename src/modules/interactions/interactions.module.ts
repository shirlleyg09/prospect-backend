import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InteractionController } from './interaction.controller';
import { InteractionService } from './interaction.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionsModule {}
