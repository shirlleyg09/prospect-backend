/**
 * @file ai.service.ts
 * @description
 *   Ponto único de entrada para tarefas cognitivas. Nenhum outro serviço
 *   fala com LLM — tudo passa por aqui. Isso garante:
 *     - Troca de modelo sem impacto nos consumidores
 *     - Observabilidade unificada (tokens, latência, custo)
 *     - Versionamento de prompts em um só lugar
 *     - Rate limiting e retry centralizados
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Lead } from '@prisma/client';
import { AIProvider } from '../ai-provider.interface';
import {
  APPROACH_SYSTEM,
  APPROACH_USER,
  INSIGHTS_SYSTEM,
  INSIGHTS_USER,
  SCORING_SYSTEM,
  SCORING_USER,
} from '../prompts/prompts';

export const AI_PROVIDER_TOKEN = Symbol('AI_PROVIDER');

export interface LeadScoring {
  leadScore: number;
  opportunityScore: number;
  temperature: 'COLD' | 'WARM' | 'HOT';
  estimatedTicket: number;
  reasoning: string;
}

export interface LeadInsight {
  problem: string;
  evidence: string;
  suggestion: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface LeadInsightsResult {
  insights: LeadInsight[];
  valueReason: string;
}

export interface ApproachMessage {
  subject: string | null;
  body: string;
}

export type ApproachChannel = 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(@Inject(AI_PROVIDER_TOKEN) private readonly ai: AIProvider) {}

  /**
   * Calcula scoring completo de um lead.
   * Idempotente: chamar 2x com o mesmo lead não muda nada persistido
   * (persistência é responsabilidade do caller).
   */
  async scoreLead(lead: Partial<Lead>): Promise<LeadScoring> {
    const res = await this.ai.complete({
      system: SCORING_SYSTEM,
      user: SCORING_USER(lead),
      jsonMode: true,
      temperature: 0.1,
      tag: 'scoreLead',
    });
    return this.parseJson<LeadScoring>(res.text, 'scoreLead');
  }

  async generateInsights(lead: Partial<Lead>): Promise<LeadInsightsResult> {
    const res = await this.ai.complete({
      system: INSIGHTS_SYSTEM,
      user: INSIGHTS_USER(lead),
      jsonMode: true,
      temperature: 0.4,
      tag: 'generateInsights',
    });
    return this.parseJson<LeadInsightsResult>(res.text, 'generateInsights');
  }

  async generateApproach(
    lead: Partial<Lead>,
    channel: ApproachChannel,
    offer: string,
  ): Promise<ApproachMessage> {
    const res = await this.ai.complete({
      system: APPROACH_SYSTEM,
      user: APPROACH_USER(lead, channel, offer),
      jsonMode: true,
      temperature: 0.6,
      maxTokens: 500,
      tag: `approach:${channel}`,
    });
    return this.parseJson<ApproachMessage>(res.text, 'generateApproach');
  }

  /**
   * Método composto: roda scoring + insights em paralelo e devolve o pacote
   * completo de análise para persistência atômica.
   */
  async fullAnalysis(lead: Partial<Lead>): Promise<{
    scoring: LeadScoring;
    insights: LeadInsightsResult;
  }> {
    const [scoring, insights] = await Promise.all([
      this.scoreLead(lead),
      this.generateInsights(lead),
    ]);
    return { scoring, insights };
  }

  /**
   * Método genérico para tarefas que não têm abstração própria no AIService
   * (ex: geração/refinamento de propostas, que usam prompts altamente
   * contextuais construídos pelo caller).
   *
   * O caller passa system+user já prontos e recebe o texto + meta.
   * Continua passando pelo AIService para manter telemetria/observabilidade
   * centralizadas.
   */
  async completeWithJson(args: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    tag?: string;
  }): Promise<{
    text: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
  }> {
    const res = await this.ai.complete({
      system: args.system,
      user: args.user,
      jsonMode: true,
      temperature: args.temperature ?? 0.3,
      maxTokens: args.maxTokens ?? 2048,
      tag: args.tag ?? 'completeWithJson',
    });
    return res;
  }

  // ---------------------------------------------------------------------------
  private parseJson<T>(raw: string, tag: string): T {
    try {
      // LLMs às vezes envelopam em ```json ... ```
      const cleaned = raw
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch (err) {
      this.logger.error(`Falha parsing JSON em ${tag}: ${raw.slice(0, 200)}`);
      throw new Error(`AI retornou JSON inválido em ${tag}`);
    }
  }

  /**
   * Gera uma cláusula contratual com IA, baseada no tipo de serviço e tipo de cláusula desejada.
   */
  async generateContractClause(args: {
    serviceType: string;
    clauseType: string;
    context?: string;
  }): Promise<{ title: string; content: string }> {
    const res = await this.ai.complete({
      system: `Você é um especialista em contratos comerciais brasileiros.
Gere cláusulas claras, juridicamente sólidas e em português.
Retorne APENAS um JSON: {"title": "...", "content": "## TÍTULO\\n\\ntexto em markdown..."}`,
      user: `Tipo de serviço: ${args.serviceType}
Tipo de cláusula: ${args.clauseType}
${args.context ? `Contexto: ${args.context}` : ''}

Gere a cláusula em markdown, com título em ## (h2).`,
      jsonMode: true,
      temperature: 0.3,
      tag: 'generateContractClause',
    });
    return this.parseJson<{ title: string; content: string }>(
      res.text,
      'generateContractClause',
    );
  }

  /**
   * Revisa contrato e identifica issues e sugestões.
   */
  async reviewContract(content: string): Promise<{
    issues: Array<{ severity: 'low' | 'medium' | 'high'; message: string }>;
    suggestions: string[];
  }> {
    const res = await this.ai.complete({
      system: `Você é um revisor jurídico de contratos comerciais brasileiros.
Retorne APENAS JSON: {"issues":[{"severity":"low|medium|high","message":"..."}],"suggestions":["..."]}.
Identifique cláusulas faltando, ambiguidades, riscos, redação imprecisa.
Máximo 5 issues e 5 suggestions.`,
      user: `Contrato:\n\n${content.slice(0, 6000)}`,
      jsonMode: true,
      temperature: 0.2,
      tag: 'reviewContract',
    });
    return this.parseJson(res.text, 'reviewContract');
  }
}
