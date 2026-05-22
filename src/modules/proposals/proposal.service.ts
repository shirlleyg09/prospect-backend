/**
 * @file proposal.service.ts
 * @description
 *   Service central do módulo de Propostas.
 *
 *   Responsabilidades:
 *     - CRUD (listar, criar, atualizar, deletar)
 *     - Geração de conteúdo via IA (inicial)
 *     - Refinamento via IA (chat lateral)
 *     - Publicação (gera slug único, muda status)
 *     - Registro de visualização (tracking)
 *     - Enforcement de quota mensal
 *     - Atualização de status → cache no Lead (lastProposalStatus)
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Proposal,
  ProposalStatus,
  ProposalTemplate,
  ProposalTemplateCategory,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/services/ai.service';
import {
  LeadContext,
  REFINEMENT_SYSTEM_PROMPT,
  BASE_SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  buildGenerationUserPrompt,
  buildRefinementUserPrompt,
} from './prompts/proposal.prompts';
import {
  CreateProposalDto,
  UpdateProposalDto,
  RefineProposalDto,
} from './dto/proposal.dto';

export interface ProposalWithRelations extends Proposal {
  lead: { id: string; name: string; niche: string | null };
  template: { id: string; name: string; category: ProposalTemplateCategory } | null;
  createdBy: { id: string; name: string };
  _count?: { views: number; refinements: number };
}

import { FinanceService } from '../finance/finance.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class ProposalService {
  private readonly logger = new Logger(ProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    @Inject(FinanceService) private readonly financeService: FinanceService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  // --------------------------------------------------------------------------
  // LISTAGEM & DETALHE
  // --------------------------------------------------------------------------

  async list(teamId: string, filters: {
    leadId?: string;
    status?: ProposalStatus;
    page?: number;
    perPage?: number;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 25, 100);

    const where: Prisma.ProposalWhereInput = {
      teamId,
      ...(filters.leadId && { leadId: filters.leadId }),
      ...(filters.status && { status: filters.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          lead: { select: { id: true, name: true, niche: true } },
          template: { select: { id: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { views: true, refinements: true } },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findById(teamId: string, id: string): Promise<ProposalWithRelations> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, teamId },
      include: {
        lead: { select: { id: true, name: true, niche: true } },
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { views: true, refinements: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposta não encontrada');
    return proposal as ProposalWithRelations;
  }

  /**
   * Busca pública (sem auth) por slug — usada em /p/:slug.
   * Retorna apenas campos renderizáveis (sem dados sensíveis).
   */
  async findByPublicSlug(slug: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { publicSlug: slug },
      include: {
        lead: { select: { name: true } },
        template: { select: { category: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposta não encontrada');
    if (proposal.status === 'RASCUNHO') {
      throw new NotFoundException('Proposta não encontrada'); // não expor rascunhos
    }
    if (proposal.expiresAt && proposal.expiresAt < new Date()) {
      throw new ForbiddenException('Esta proposta expirou');
    }
    return proposal;
  }

  // --------------------------------------------------------------------------
  // CRIAÇÃO (com geração de IA)
  // --------------------------------------------------------------------------

  /**
   * Cria uma proposta a partir de um lead + template.
   * A IA gera o conteúdo inicial.
   * Aplica enforcement de quota mensal do plano.
   */
  async create(
    teamId: string,
    userId: string,
    dto: CreateProposalDto,
  ): Promise<ProposalWithRelations> {
    // 1. Valida quota
    await this.assertCanCreate(teamId);

    // 2. Valida lead + template
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, teamId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const template = await this.prisma.proposalTemplate.findFirst({
      where: {
        id: dto.templateId,
        OR: [{ teamId }, { teamId: null }], // templates globais ou do team
        isActive: true,
      },
    });
    if (!template) throw new NotFoundException('Template não encontrado ou inativo');

    // 3. Monta contexto do lead pra IA
    const leadContext: LeadContext = {
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
        ? (lead.insights as string[]).filter((x) => typeof x === 'string')
        : undefined,
    };

    // 4. Gera conteúdo via IA
    let aiContent: { title: string; content: unknown; plans: unknown };
    try {
      aiContent = await this.generateWithAI(template, leadContext, dto.briefing);
    } catch (err) {
      this.logger.error(`Falha na geração IA da proposta: ${(err as Error).message}`);
      throw new BadRequestException(
        `Não foi possível gerar a proposta com IA: ${(err as Error).message}`,
      );
    }

    // 5. Persiste
    const proposal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proposal.create({
        data: {
          teamId,
          leadId: lead.id,
          templateId: template.id,
          createdById: userId,
          title: aiContent.title ?? `Proposta para ${lead.name}`,
          status: 'RASCUNHO',
          content: aiContent.content as Prisma.InputJsonValue,
          plans: aiContent.plans as Prisma.InputJsonValue,
          paymentConditions: {
            methods: ['PIX', 'CARD', 'TRANSFER'],
            terms: '50% de entrada + 50% na entrega',
            discountCash: 0,
          } as Prisma.InputJsonValue,
          metadata: {
            briefing: dto.briefing ?? null,
            generatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
        include: {
          lead: { select: { id: true, name: true, niche: true } },
          template: { select: { id: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { views: true, refinements: true } },
        },
      });

      // Incrementa contador mensal
      await this.incrementUsage(tx, teamId, 'created');

      return created;
    });

    // 6. Atualiza cache no Lead (lastProposalStatus)
    await this.syncLeadCache(lead.id);

    // 7. Registra evento de criação no histórico
    await this.recordEvent(proposal.id, userId, 'CREATED', {
      description: `Proposta criada para ${lead.name}`,
    });

    return proposal as ProposalWithRelations;
  }

  // --------------------------------------------------------------------------
  // ATUALIZAÇÃO (edição manual de seções/planos/condições)
  // --------------------------------------------------------------------------

  async update(
    teamId: string,
    userId: string,
    id: string,
    dto: UpdateProposalDto,
  ): Promise<ProposalWithRelations> {
    const existing = await this.findById(teamId, id);

    // Não permite editar depois de APROVADA/REJEITADA (imutabilidade pós-fechamento)
    if (existing.status === 'APROVADA' || existing.status === 'REJEITADA') {
      throw new ConflictException(
        'Propostas aprovadas ou rejeitadas não podem ser editadas',
      );
    }

    const data: Prisma.ProposalUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content as Prisma.InputJsonValue;
    if (dto.plans !== undefined) data.plans = dto.plans as Prisma.InputJsonValue;
    if (dto.paymentConditions !== undefined) {
      data.paymentConditions = dto.paymentConditions as Prisma.InputJsonValue;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.metadata !== undefined) {
      // Mescla com metadata existente — não sobrescreve briefing/etc
      data.metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),
        ...dto.metadata,
      } as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data,
      include: {
        lead: { select: { id: true, name: true, niche: true } },
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { views: true, refinements: true } },
      },
    });

    // Registra evento de edição (mas só se mudou algo significativo,
    // não toda salvada de plano/cor)
    const changedFields: string[] = [];
    if (dto.title !== undefined) changedFields.push('título');
    if (dto.content !== undefined) changedFields.push('conteúdo');
    if (dto.plans !== undefined) changedFields.push('planos');
    if (dto.paymentConditions !== undefined) changedFields.push('pagamento');
    if (dto.expiresAt !== undefined) changedFields.push('validade');

    if (changedFields.length > 0) {
      await this.recordEvent(id, userId, 'UPDATED', {
        description: `Proposta editada (${changedFields.join(', ')})`,
        fields: changedFields,
      });
    }

    return updated as ProposalWithRelations;
  }

  // --------------------------------------------------------------------------
  // REFINAMENTO COM IA (chat lateral)
  // --------------------------------------------------------------------------

  async refine(
    teamId: string,
    userId: string,
    id: string,
    dto: RefineProposalDto,
  ): Promise<ProposalWithRelations> {
    const proposal = await this.findById(teamId, id);

    if (proposal.status === 'APROVADA' || proposal.status === 'REJEITADA') {
      throw new ConflictException('Propostas aprovadas ou rejeitadas não podem ser refinadas');
    }

    // Snapshot antes
    const snapshotBefore = {
      content: proposal.content,
      plans: proposal.plans,
      title: proposal.title,
    };

    let refined: { title?: string; content: unknown; plans: unknown };
    let errorMessage: string | null = null;
    let aiMeta: Record<string, unknown> = {};

    try {
      const response = await this.ai.completeWithJson({
        system: REFINEMENT_SYSTEM_PROMPT,
        user: buildRefinementUserPrompt({
          currentProposal: {
            title: proposal.title,
            content: proposal.content,
            plans: proposal.plans,
          },
          instruction: dto.instruction,
        }),
        temperature: 0.4,
        maxTokens: 4096,
        tag: 'proposal-refine',
      });

      refined = this.parseAIJson(response.text);
      aiMeta = {
        model: response.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        latencyMs: response.latencyMs,
      };
    } catch (err) {
      errorMessage = (err as Error).message;
      this.logger.error(`Refinamento IA falhou: ${errorMessage}`);
      // registra a tentativa mesmo com falha (pra auditoria)
      await this.prisma.proposalRefinement.create({
        data: {
          proposalId: id,
          userId,
          prompt: dto.instruction,
          snapshotBefore: snapshotBefore as Prisma.InputJsonValue,
          success: false,
          errorMessage,
        },
      });

      // Mensagem mais amigável se for rate limit
      if (errorMessage.includes('Limite de requisições') || errorMessage.includes('rate limit')) {
        throw new BadRequestException(
          'A IA está sobrecarregada (muitas gerações em sequência). Aguarde 30 segundos e tente novamente.',
        );
      }
      throw new BadRequestException(`Refinamento falhou: ${errorMessage}`);
    }

    // Aplica + registra
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.proposal.update({
        where: { id },
        data: {
          title: refined.title ?? proposal.title,
          content: refined.content as Prisma.InputJsonValue,
          plans: refined.plans as Prisma.InputJsonValue,
        },
        include: {
          lead: { select: { id: true, name: true, niche: true } },
          template: { select: { id: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { views: true, refinements: true } },
        },
      });

      await tx.proposalRefinement.create({
        data: {
          proposalId: id,
          userId,
          prompt: dto.instruction,
          snapshotBefore: snapshotBefore as Prisma.InputJsonValue,
          aiMeta: aiMeta as Prisma.InputJsonValue,
          success: true,
        },
      });

      await this.incrementUsage(tx, teamId, 'refinement');

      return u;
    });

    return updated as ProposalWithRelations;
  }

  // --------------------------------------------------------------------------
  // PUBLICAÇÃO
  // --------------------------------------------------------------------------

  async publish(teamId: string, userId: string, id: string): Promise<ProposalWithRelations> {
    const existing = await this.findById(teamId, id);

    if (existing.status !== 'RASCUNHO' && !existing.publicSlug) {
      // Já passou de rascunho sem slug — caso raro, regenera
    }

    const slug = existing.publicSlug ?? generateSlug(existing.lead.name);
    const wasFirstPublish = !existing.publishedAt;

    const published = await this.prisma.proposal.update({
      where: { id },
      data: {
        publicSlug: slug,
        publishedAt: existing.publishedAt ?? new Date(),
        status: existing.status === 'RASCUNHO' ? 'ENVIADA' : existing.status,
      },
      include: {
        lead: { select: { id: true, name: true, niche: true } },
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { views: true, refinements: true } },
      },
    });

    await this.syncLeadCache(existing.leadId);

    // Registra publicação (1ª vez vira PUBLISHED, repetições de publicação
    // viram REPUBLISHED — mas hoje normalmente é só uma vez)
    await this.recordEvent(id, userId, wasFirstPublish ? 'PUBLISHED' : 'REPUBLISHED', {
      description: wasFirstPublish
        ? `Proposta publicada e enviada ao cliente`
        : `Proposta republicada`,
      slug,
    });

    return published as ProposalWithRelations;
  }

  // --------------------------------------------------------------------------
  // MUDANÇA DE STATUS MANUAL (aprovar, rejeitar, em negociação)
  // --------------------------------------------------------------------------

  async updateStatus(
    teamId: string,
    userId: string,
    id: string,
    status: ProposalStatus,
    rejectionReason?: string,
  ): Promise<ProposalWithRelations> {
    const existing = await this.findById(teamId, id);

    const data: Prisma.ProposalUpdateInput = { status };
    if (status === 'APROVADA') data.approvedAt = new Date();
    if (status === 'REJEITADA') {
      data.rejectedAt = new Date();
      if (rejectionReason) data.rejectionReason = rejectionReason;
    }

    // Se voltando de APROVADA/REJEITADA pra outro status (ex: ENVIADA),
    // limpa os campos de fechamento pra proposta ser editável novamente.
    const isReverting =
      (existing.status === 'APROVADA' || existing.status === 'REJEITADA') &&
      status !== 'APROVADA' &&
      status !== 'REJEITADA';

    if (isReverting) {
      data.approvedAt = null;
      data.rejectedAt = null;
      data.rejectionReason = null;
      this.logger.log(`Proposta ${id}: status revertido de ${existing.status} → ${status}`);
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data,
      include: {
        lead: { select: { id: true, name: true, niche: true } },
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { views: true, refinements: true } },
      },
    });

    await this.syncLeadCache(existing.leadId);

    // Automação financeira: quando aprovada, cria Revenue + parcelas
    if (status === 'APROVADA' && this.financeService) {
      try {
        await this.financeService.createFromApprovedProposal({
          id: updated.id,
          teamId,
          title: updated.title,
          leadId: updated.leadId,
          plans: updated.plans,
          paymentConditions: updated.paymentConditions,
          metadata: updated.metadata,
        });
        this.logger.log(`Revenue criada automaticamente para proposta ${id}`);
      } catch (err) {
        // Não falha a aprovação se der erro no financeiro
        this.logger.error(`Erro ao criar revenue automática: ${(err as Error).message}`);
      }
    }

    // Se desfazendo aprovação: cancela receitas/parcelas pendentes
    // (não mexe em parcelas já pagas — preserva histórico)
    if (isReverting && existing.status === 'APROVADA' && this.financeService) {
      try {
        const result = await this.financeService.cancelRevenueByProposal(teamId, id);
        this.logger.log(`Receitas canceladas no desfazer: ${result.cancelled}`);
      } catch (err) {
        this.logger.error(`Erro ao cancelar receitas: ${(err as Error).message}`);
      }
    }

    // Registra evento na timeline com tipo correto
    let eventKind: string;
    let eventDescription: string;
    const eventMetadata: Record<string, unknown> = {};

    if (isReverting) {
      // Desfazendo aprovação ou rejeição
      eventKind = existing.status === 'APROVADA' ? 'APPROVAL_UNDONE' : 'REJECTION_UNDONE';
      eventDescription =
        existing.status === 'APROVADA'
          ? 'Aprovação desfeita — receitas pendentes canceladas'
          : 'Rejeição desfeita — proposta voltou a ser editável';
    } else if (status === 'APROVADA') {
      eventKind = 'APPROVED';
      const meta = (updated.metadata as Record<string, unknown>) ?? {};
      const plan = meta.approvedPlan as { name?: string; price?: number } | undefined;
      eventDescription = plan
        ? `Proposta aprovada — plano "${plan.name}" (R$ ${plan.price})`
        : `Proposta aprovada`;
      if (plan) eventMetadata.plan = plan;
    } else if (status === 'REJEITADA') {
      eventKind = 'REJECTED';
      eventDescription = rejectionReason
        ? `Proposta rejeitada — motivo: ${rejectionReason}`
        : `Proposta rejeitada`;
      if (rejectionReason) eventMetadata.reason = rejectionReason;
    } else {
      eventKind = 'STATUS_CHANGED';
      eventDescription = `Status alterado: ${existing.status} → ${status}`;
      eventMetadata.from = existing.status;
      eventMetadata.to = status;
    }

    await this.recordEvent(id, userId, eventKind, {
      description: eventDescription,
      ...eventMetadata,
    });

    return updated as ProposalWithRelations;
  }

  // --------------------------------------------------------------------------
  // HISTÓRICO / TIMELINE
  // --------------------------------------------------------------------------

  /**
   * Helper interno: grava um evento no histórico da proposta.
   * Não bloqueia caller se falhar (history é log, nunca crítico).
   */
  private async recordEvent(
    proposalId: string,
    userId: string | null,
    kind: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.proposalEvent.create({
        data: {
          proposalId,
          userId: userId ?? null,
          kind,
          description: (metadata.description as string) ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao registrar evento ${kind}: ${(err as Error).message}`);
    }
  }

  /**
   * Retorna timeline de eventos da proposta + dados básicos pra UI.
   */
  async getHistory(teamId: string, id: string) {
    // Garante isolamento por team
    await this.findById(teamId, id);

    const events = await this.prisma.proposalEvent.findMany({
      where: { proposalId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return { events };
  }

  // --------------------------------------------------------------------------
  // TRACKING — chamado pela rota PÚBLICA (/p/:slug/view)
  // --------------------------------------------------------------------------

  async recordView(args: {
    proposalId: string;
    sessionId: string;
    ipHash?: string;
    userAgent?: string;
    referer?: string;
    readingTimeSec?: number;
    scrollDepthPct?: number;
  }) {
    // Se já existe view dessa sessão, ATUALIZA (heartbeat); senão CRIA
    const existing = await this.prisma.proposalView.findFirst({
      where: { proposalId: args.proposalId, sessionId: args.sessionId },
      orderBy: { viewedAt: 'desc' },
    });

    let view;
    if (existing) {
      view = await this.prisma.proposalView.update({
        where: { id: existing.id },
        data: {
          readingTimeSec: Math.max(existing.readingTimeSec, args.readingTimeSec ?? 0),
          scrollDepthPct: Math.max(existing.scrollDepthPct, args.scrollDepthPct ?? 0),
        },
      });
    } else {
      view = await this.prisma.proposalView.create({
        data: {
          proposalId: args.proposalId,
          sessionId: args.sessionId,
          ipHash: args.ipHash,
          userAgent: args.userAgent,
          referer: args.referer,
          readingTimeSec: args.readingTimeSec ?? 0,
          scrollDepthPct: args.scrollDepthPct ?? 0,
        },
      });

      // Primeira view dessa sessão — atualiza agregados da proposta
      const propBefore = await this.prisma.proposal.findUnique({
        where: { id: args.proposalId },
        select: { status: true, teamId: true, title: true, lead: { select: { name: true } } },
      });

      await this.prisma.proposal.update({
        where: { id: args.proposalId },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
          // Marca como VISUALIZADA se ainda estava só ENVIADA
          status:
            propBefore?.status === 'ENVIADA' ? 'VISUALIZADA' : undefined,
        },
      });

      // Dispara notificação — primeira visualização ou revisita
      // (uma vez por sessão; o dedup vai filtrar se for muito recente)
      if (propBefore) {
        const isFirstView = propBefore.status === 'ENVIADA';
        try {
          await this.notifications.createDeduped(
            {
              teamId: propBefore.teamId,
              kind: isFirstView ? 'PROPOSAL_VIEWED' : 'PROPOSAL_REVISITED',
              title: isFirstView
                ? `${propBefore.lead.name} abriu sua proposta`
                : `${propBefore.lead.name} revisitou a proposta`,
              body: isFirstView
                ? `"${propBefore.title}" foi vista pela primeira vez. Bom momento pra entrar em contato!`
                : `"${propBefore.title}" foi vista de novo — sinal de interesse forte.`,
              link: `/proposals/${args.proposalId}`,
              metadata: {
                proposalId: args.proposalId,
                leadName: propBefore.lead.name,
              },
            },
            // Anti-spam: 30 minutos entre notificações iguais
            30,
          );
        } catch (err) {
          this.logger.error(
            `Falha ao criar notificação de view: ${(err as Error).message}`,
          );
        }
      }
    }

    // Atualiza tempo total de leitura
    const allViews = await this.prisma.proposalView.findMany({
      where: { proposalId: args.proposalId },
      select: { readingTimeSec: true },
    });
    const totalTime = allViews.reduce((acc, v) => acc + v.readingTimeSec, 0);
    await this.prisma.proposal.update({
      where: { id: args.proposalId },
      data: { totalReadingTimeSec: totalTime },
    });

    return view;
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async remove(teamId: string, id: string): Promise<void> {
    const existing = await this.findById(teamId, id);
    await this.prisma.proposal.delete({ where: { id } });
    await this.syncLeadCache(existing.leadId);
  }

  // --------------------------------------------------------------------------
  // QUOTA / USAGE
  // --------------------------------------------------------------------------

  async getUsage(teamId: string): Promise<{
    used: number;
    quota: number;
    refinements: number;
    period: { year: number; month: number };
  }> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team não encontrado');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const usage = await this.prisma.proposalUsage.findUnique({
      where: { teamId_year_month: { teamId, year, month } },
    });

    return {
      used: usage?.createdCount ?? 0,
      quota: team.proposalsQuota,
      refinements: usage?.refinementCount ?? 0,
      period: { year, month },
    };
  }

  private async assertCanCreate(teamId: string): Promise<void> {
    const usage = await this.getUsage(teamId);
    if (usage.quota > 0 && usage.used >= usage.quota) {
      throw new ForbiddenException(
        `Limite mensal de propostas atingido (${usage.used}/${usage.quota}). ` +
          'Faça upgrade do plano ou aguarde o início do próximo mês.',
      );
    }
  }

  private async incrementUsage(
    tx: Prisma.TransactionClient,
    teamId: string,
    kind: 'created' | 'refinement',
  ): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await tx.proposalUsage.upsert({
      where: { teamId_year_month: { teamId, year, month } },
      create: {
        teamId,
        year,
        month,
        createdCount: kind === 'created' ? 1 : 0,
        refinementCount: kind === 'refinement' ? 1 : 0,
      },
      update: {
        createdCount: kind === 'created' ? { increment: 1 } : undefined,
        refinementCount: kind === 'refinement' ? { increment: 1 } : undefined,
      },
    });
  }

  // --------------------------------------------------------------------------
  // HELPERS PRIVADOS
  // --------------------------------------------------------------------------

  /**
   * Roda a IA pra geração inicial da proposta. Retorna JSON parseado.
   */
  private async generateWithAI(
    template: ProposalTemplate,
    leadContext: LeadContext,
    briefing?: string,
  ): Promise<{ title: string; content: unknown; plans: unknown }> {
    const outline = Array.isArray(template.outline)
      ? (template.outline as string[])
      : [];

    const pricing =
      (template.defaultPricing as {
        basic: [number, number];
        intermediate: [number, number];
        premium: [number, number];
      }) ?? {
        basic: [1000, 3000],
        intermediate: [3000, 8000],
        premium: [8000, 20000],
      };

    const systemPrompt = `${BASE_SYSTEM_PROMPT}

${template.aiPrompt ?? ''}

${OUTPUT_SCHEMA}`;

    const userPrompt = buildGenerationUserPrompt({
      lead: leadContext,
      templateOutline: outline,
      templatePricing: pricing,
      briefing,
    });

    const response = await this.ai.completeWithJson({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.5,
      maxTokens: 4096,
      tag: 'proposal-generate',
    });

    return this.parseAIJson(response.text);
  }

  /**
   * Parseia o JSON da IA de forma defensiva.
   * Alguns modelos às vezes enrolam com markdown (```json ... ```) mesmo
   * com jsonMode true. Limpa antes de parsear.
   */
  private parseAIJson(text: string): {
    title: string;
    content: unknown;
    plans: unknown;
  } {
    let clean = text.trim();
    // Remove possíveis ```json ... ``` ou ``` ... ```
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(clean);
      if (!parsed.content || !parsed.plans) {
        throw new Error('Resposta da IA sem os campos obrigatórios (content/plans)');
      }
      return {
        title: parsed.title ?? 'Proposta',
        content: parsed.content,
        plans: parsed.plans,
      };
    } catch (err) {
      this.logger.error(`Falha ao parsear JSON da IA: ${(err as Error).message}`);
      this.logger.error(`Texto recebido (primeiros 500 chars): ${clean.slice(0, 500)}`);
      throw new Error('Resposta da IA não é um JSON válido. Tente novamente.');
    }
  }

  /**
   * Atualiza o cache no Lead com o status da proposta MAIS RECENTE.
   * Performance: permite queries no Kanban sem join pesado.
   */
  private async syncLeadCache(leadId: string): Promise<void> {
    const latest = await this.prisma.proposal.findFirst({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        lastProposalStatus: latest?.status ?? null,
        lastProposalAt: latest?.createdAt ?? null,
      },
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Gera um slug público único-ish: kebab-case do nome do lead + 6 chars aleatórios.
 * Uniqueness garantida pelo @unique do schema (se colidir, o create joga erro
 * e o usuário tenta de novo — colisão é praticamente impossível).
 */
function generateSlug(leadName: string): string {
  const baseSlug = leadName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const suffix = randomBytes(4).toString('hex');
  return `${baseSlug || 'proposta'}-${suffix}`;
}
