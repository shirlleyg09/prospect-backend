/**
 * @file message.service.ts
 * @description
 *   Service do módulo de mensagens.
 *
 *   Responsabilidades:
 *     - CRUD de templates (globais + por team)
 *     - Geração de mensagem por template (IA usa prompt do template)
 *     - Geração livre (IA usa prompt do usuário)
 *     - Refinamento de mensagem com IA
 *     - Listagem com filtros
 *     - Persistência em `Message` para histórico
 *
 *   Integração com IA: vai pelo AIService.completeWithJson centralizado.
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  InteractionChannel,
  MessageTemplate,
  MessageTemplateCategory,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/services/ai.service';
import {
  BASE_MESSAGE_SYSTEM_PROMPT,
  buildFreeMessagePrompt,
  buildRefineMessagePrompt,
  buildTemplateMessagePrompt,
  FREE_MESSAGE_SYSTEM_PROMPT,
  LeadContext,
  REFINE_MESSAGE_SYSTEM_PROMPT,
} from './prompts/message.prompts';
import { DEFAULT_MESSAGE_TEMPLATES } from './seed/message-templates.seed';

export interface GeneratedMessage {
  id: string;
  leadId: string;
  templateId: string | null;
  channel: InteractionChannel;
  body: string;
  subject?: string | null;
  aiMeta?: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class MessageService implements OnModuleInit {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
  ) {}

  // --------------------------------------------------------------------------
  // SEED — roda na inicialização
  // --------------------------------------------------------------------------

  onModuleInit(): void {
    // Fire-and-forget: não bloqueia o startup do app
    this.seedDefaults().catch((err) =>
      this.logger.error(`Falha ao seedar MessageTemplates: ${(err as Error).message}`),
    );
  }

  async seedDefaults(): Promise<void> {
    for (const tpl of DEFAULT_MESSAGE_TEMPLATES) {
      const existing = await this.prisma.messageTemplate.findFirst({
        where: { teamId: null, name: tpl.name },
      });
      if (!existing) {
        await this.prisma.messageTemplate.create({
          data: {
            teamId: null,
            name: tpl.name,
            channel: tpl.channel,
            category: tpl.category,
            description: tpl.description,
            aiPrompt: tpl.aiPrompt,
            isActive: true,
          },
        });
        this.logger.log(`MessageTemplate global seedado: ${tpl.name}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // TEMPLATES
  // --------------------------------------------------------------------------

  /**
   * Lista templates disponíveis pro team:
   *   - globais (teamId=null) ativos
   *   - do próprio team ativos
   */
  async listTemplates(teamId: string, filters?: {
    channel?: InteractionChannel;
    category?: MessageTemplateCategory;
  }) {
    return this.prisma.messageTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ teamId: null }, { teamId }],
        ...(filters?.channel && { channel: filters.channel }),
        ...(filters?.category && { category: filters.category }),
      },
      orderBy: [{ teamId: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  // --------------------------------------------------------------------------
  // LISTAGEM DE MENSAGENS GERADAS
  // --------------------------------------------------------------------------

  async listMessages(
    teamId: string,
    filters: {
      leadId?: string;
      channel?: InteractionChannel;
      page?: number;
      perPage?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 25, 100);

    const where: Prisma.MessageWhereInput = {
      lead: { teamId },
      ...(filters.leadId && { leadId: filters.leadId }),
      ...(filters.channel && { channel: filters.channel }),
    };

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          lead: { select: { id: true, name: true, niche: true } },
          template: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findMessageById(teamId: string, id: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, lead: { teamId } },
      include: {
        lead: { select: { id: true, name: true, niche: true } },
        template: { select: { id: true, name: true, category: true } },
      },
    });
    if (!message) throw new NotFoundException('Mensagem não encontrada');
    return message;
  }

  async deleteMessage(teamId: string, id: string): Promise<void> {
    // confirma posse via lead
    await this.findMessageById(teamId, id);
    await this.prisma.message.delete({ where: { id } });
  }

  // --------------------------------------------------------------------------
  // GERAÇÃO COM IA — POR TEMPLATE (situação fixa)
  // --------------------------------------------------------------------------

  /**
   * Gera mensagem usando template (que tem aiPrompt curado).
   * Persiste em Message.
   */
  async generateFromTemplate(args: {
    teamId: string;
    leadId: string;
    templateId: string;
    briefing?: string;
  }): Promise<GeneratedMessage> {
    const { teamId, leadId, templateId, briefing } = args;

    // 1. Lead
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, teamId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    // 2. Template
    const template = await this.prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        OR: [{ teamId: null }, { teamId }],
        isActive: true,
      },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    // 3. Contexto do lead pra IA
    const leadContext = this.buildLeadContext(lead);

    // 4. Prompt: base + específico do template
    const systemPrompt = `${BASE_MESSAGE_SYSTEM_PROMPT}

${template.aiPrompt ?? ''}`;

    const userPrompt = buildTemplateMessagePrompt({
      lead: leadContext,
      channel: this.toApproachChannel(template.channel),
      briefing,
    });

    // 5. Chama IA
    const response = await this.ai.completeWithJson({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.7,
      maxTokens: 600,
      tag: `message-template:${template.category}`,
    });

    const parsed = this.parseAIJson(response.text);

    // 6. Persiste
    const created = await this.prisma.message.create({
      data: {
        leadId,
        templateId,
        channel: template.channel,
        body: parsed.body,
        aiMeta: {
          subject: parsed.subject,
          generatedAt: new Date().toISOString(),
          mode: 'template',
          templateName: template.name,
          model: response.model,
          tokens: response.completionTokens,
        } as Prisma.InputJsonValue,
      },
    });

    return this.toGeneratedMessage(created, parsed.subject);
  }

  // --------------------------------------------------------------------------
  // GERAÇÃO COM IA — LIVRE (prompt do usuário)
  // --------------------------------------------------------------------------

  async generateFree(args: {
    teamId: string;
    leadId: string;
    channel: InteractionChannel;
    instruction: string;
  }): Promise<GeneratedMessage> {
    const { teamId, leadId, channel, instruction } = args;

    if (!instruction?.trim()) {
      throw new ForbiddenException('Instrução é obrigatória pra geração livre');
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, teamId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const leadContext = this.buildLeadContext(lead);

    const userPrompt = buildFreeMessagePrompt({
      lead: leadContext,
      channel: this.toApproachChannel(channel),
      instruction,
    });

    const response = await this.ai.completeWithJson({
      system: FREE_MESSAGE_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.8,
      maxTokens: 600,
      tag: 'message-free',
    });

    const parsed = this.parseAIJson(response.text);

    const created = await this.prisma.message.create({
      data: {
        leadId,
        templateId: null,
        channel,
        body: parsed.body,
        aiMeta: {
          subject: parsed.subject,
          generatedAt: new Date().toISOString(),
          mode: 'free',
          instruction: instruction.slice(0, 500),
          model: response.model,
        } as Prisma.InputJsonValue,
      },
    });

    return this.toGeneratedMessage(created, parsed.subject);
  }

  // --------------------------------------------------------------------------
  // REFINAMENTO COM IA
  // --------------------------------------------------------------------------

  async refine(args: {
    teamId: string;
    messageId: string;
    instruction: string;
  }): Promise<GeneratedMessage> {
    const { teamId, messageId, instruction } = args;

    if (!instruction?.trim()) {
      throw new ForbiddenException('Instrução é obrigatória');
    }

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, lead: { teamId } },
    });
    if (!message) throw new NotFoundException('Mensagem não encontrada');

    const currentSubject =
      ((message.aiMeta as Record<string, unknown> | null)?.subject as
        | string
        | null) ?? null;

    const userPrompt = buildRefineMessagePrompt({
      currentMessage: { subject: currentSubject, body: message.body },
      channel: this.toApproachChannel(message.channel),
      instruction,
    });

    const response = await this.ai.completeWithJson({
      system: REFINE_MESSAGE_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.6,
      maxTokens: 600,
      tag: 'message-refine',
    });

    const parsed = this.parseAIJson(response.text);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        body: parsed.body,
        aiMeta: {
          ...((message.aiMeta as Record<string, unknown> | null) ?? {}),
          subject: parsed.subject,
          refinedAt: new Date().toISOString(),
          lastInstruction: instruction.slice(0, 500),
        } as Prisma.InputJsonValue,
      },
    });

    return this.toGeneratedMessage(updated, parsed.subject);
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildLeadContext(lead: any): LeadContext {
    return {
      name: lead.name,
      niche: lead.niche ?? undefined,
      city: lead.city ?? undefined,
      state: lead.state ?? undefined,
      website: lead.website ?? undefined,
      instagram: lead.instagram ?? undefined,
      googleRating: lead.googleRating ?? undefined,
      googleReviews: lead.googleReviews ?? undefined,
      hasWebsite: !!lead.website,
      description: lead.description ?? undefined,
      insights: Array.isArray(lead.insights)
        ? (lead.insights as unknown[])
            .map((x) => {
              if (typeof x === 'string') return x;
              if (typeof x === 'object' && x !== null && 'problem' in x) {
                return (x as { problem: string }).problem;
              }
              return null;
            })
            .filter((x): x is string => typeof x === 'string')
        : undefined,
    };
  }

  private toApproachChannel(
    c: InteractionChannel,
  ): 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' {
    if (c === 'WHATSAPP' || c === 'EMAIL' || c === 'INSTAGRAM') return c;
    return 'WHATSAPP';
  }

  private parseAIJson(text: string): { subject: string | null; body: string } {
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    try {
      const parsed = JSON.parse(clean);
      if (!parsed.body) {
        throw new Error('Resposta da IA sem campo "body"');
      }
      return {
        subject: parsed.subject ?? null,
        body: String(parsed.body),
      };
    } catch (err) {
      this.logger.error(`Falha ao parsear JSON da IA: ${(err as Error).message}`);
      this.logger.error(`Texto: ${clean.slice(0, 300)}`);
      throw new Error('Resposta da IA não é JSON válido. Tente novamente.');
    }
  }

  private toGeneratedMessage(
    msg: { id: string; leadId: string; templateId: string | null; channel: InteractionChannel; body: string; aiMeta: Prisma.JsonValue; createdAt: Date },
    subject: string | null,
  ): GeneratedMessage {
    return {
      id: msg.id,
      leadId: msg.leadId,
      templateId: msg.templateId,
      channel: msg.channel,
      body: msg.body,
      subject,
      aiMeta: msg.aiMeta as Record<string, unknown> | null,
      createdAt: msg.createdAt,
    };
  }
}
