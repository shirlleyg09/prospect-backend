/**
 * @file ai-analyze.processor.ts
 * @description
 *   Worker que consome a fila `ai.analyze`. Para cada lead:
 *     1. Carrega dados do banco
 *     2. Chama AIService.fullAnalysis
 *     3. Persiste via LeadService.applyAIAnalysis
 *
 *   Idempotente — um lead re-analisado simplesmente atualiza os scores.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AIService } from '../modules/ai/services/ai.service';
import { LeadService } from '../modules/leads/lead.service';
import { PgQueueService } from './pg-queue.service';
import { QUEUE_AI_ANALYZE } from './queue.constants';

interface AnalyzeLeadJob {
  teamId: string;
  leadId: string;
}

@Injectable()
export class AIAnalyzeProcessor implements OnModuleInit {
  private readonly logger = new Logger(AIAnalyzeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly leadService: LeadService,
    private readonly queue: PgQueueService,
  ) {}

  async onModuleInit() {
    await this.queue.work<AnalyzeLeadJob>(
      QUEUE_AI_ANALYZE,
      (data) => this.process(data),
      { concurrency: 2 },
    );
    this.logger.log(`Worker registrado: ${QUEUE_AI_ANALYZE}`);
  }

  private async process(data: AnalyzeLeadJob): Promise<void> {
    const { leadId } = data;

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      this.logger.warn(`Lead ${leadId} não encontrado — job ignorado`);
      return;
    }

    // Skip se já foi analisado recentemente (janela de 24h)
    if (lead.aiAnalyzedAt && Date.now() - lead.aiAnalyzedAt.getTime() < 24 * 3600 * 1000) {
      this.logger.debug(`Lead ${leadId} analisado recentemente — skip`);
      return;
    }

    const { scoring, insights } = await this.ai.fullAnalysis(lead);

    await this.leadService.applyAIAnalysis(leadId, {
      leadScore: this.clamp(scoring.leadScore, 0, 100),
      opportunityScore: this.clamp(scoring.opportunityScore, 0, 100),
      temperature: scoring.temperature,
      estimatedTicket: scoring.estimatedTicket,
      insights: insights.insights as unknown as object,
      valueReason: insights.valueReason,
    });

    this.logger.log(`Lead ${leadId} analisado: score=${scoring.leadScore} temp=${scoring.temperature}`);
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(n)));
  }
}
