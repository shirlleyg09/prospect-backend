import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AIModule } from '../ai/ai.module';
import { FinanceModule } from '../finance/finance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProposalController } from './proposal.controller';
import { ProposalExportService } from './proposal-export.service';
import { ProposalService } from './proposal.service';
import { ProposalTemplateService } from './proposal-template.service';
import { PublicProposalController } from './public-proposal.controller';

@Module({
  imports: [DatabaseModule, AIModule, FinanceModule, NotificationsModule],
  controllers: [ProposalController, PublicProposalController],
  providers: [
    ProposalService,
    ProposalTemplateService,
    ProposalExportService,
  ],
  exports: [ProposalService],
})
export class ProposalsModule {}
