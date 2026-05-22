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

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { AIService } from '../modules/ai/services/ai.service';
import { LeadService } from '../modules/leads/lead.service';
import { QUEUE_AI_ANALYZE } from './queue.constants';

interface AnalyzeLeadJob {
  teamId: string;
  leadId: string;
}

@Processor(QUEUE_AI_ANALYZE, {
  // Concurrency mais alto porque o bottleneck é o LLM, não CPU local.
  // Ajuste considerando rate limits do provider de IA.
  concurrency: 2,
  limiter: {
    max: 100, // máx 100 jobs
    duration: 60_000, // por minuto → respeita rate limit do LLM
  },
})
export class AIAnalyzeProcessor extends WorkerHost {
  private readonly logger = new Logger(AIAnalyzeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly leadService: LeadService,
  ) {
    super();
  }

  async process(job: Job<AnalyzeLeadJob>): Promise<void> {
    const { leadId } = job.data;

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      this.logger.warn(`Lead ${leadId} não encontrado — job ignorado`);
      return;
    }

    // Skip se já foi analisado recentemente (janela configurável)
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
