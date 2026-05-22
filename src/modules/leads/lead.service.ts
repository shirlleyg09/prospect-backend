/**
 * @file lead.service.ts
 * @description
 *   Lógica de domínio dos leads: listagem com filtros, persistência de batch
 *   (vindo do orquestrador de providers), análise por IA, atualização.
 *
 *   Responsabilidades:
 *     - Isolamento por teamId (SEMPRE incluído em where)
 *     - Conversão NormalizedLead → persistência com upsert
 *     - Disparo de análise de IA via fila (não inline)
 *     - Aplicação de filtros e ordenação
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Lead, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { NormalizedLead } from '../providers/interfaces/lead-provider.interface';
import { CreateManualLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto';
import { QUEUE_AI_ANALYZE } from '../../queue/queue.constants';

export interface PaginatedLeads {
  items: Lead[];
  total: number;
  page: number;
  perPage: number;
}

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_AI_ANALYZE) private readonly aiQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // LISTAGEM
  // ---------------------------------------------------------------------------

  async list(teamId: string, q: ListLeadsQueryDto): Promise<PaginatedLeads> {
    const where: Prisma.LeadWhereInput = {
      teamId,
      ...(q.niche && { niche: { contains: q.niche, mode: 'insensitive' } }),
      ...(q.city && { city: { contains: q.city, mode: 'insensitive' } }),
      ...(q.state && { state: q.state }),
      ...(q.temperature && { temperature: q.temperature }),
      ...(q.pipelineStageId && { pipelineStageId: q.pipelineStageId }),
      ...(q.assignedToId && { assignedToId: q.assignedToId }),
      ...(q.tags?.length && { tags: { hasEvery: q.tags } }),
      ...(q.minScore !== undefined || q.maxScore !== undefined
        ? {
            leadScore: {
              ...(q.minScore !== undefined && { gte: q.minScore }),
              ...(q.maxScore !== undefined && { lte: q.maxScore }),
            },
          }
        : {}),
      ...(q.createdAfter || q.createdBefore
        ? {
            createdAt: {
              ...(q.createdAfter && { gte: new Date(q.createdAfter) }),
              // createdBefore é inclusivo do dia inteiro — somamos 23:59:59
              ...(q.createdBefore && {
                lte: endOfDayUtc(new Date(q.createdBefore)),
              }),
            },
          }
        : {}),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { phone: { contains: q.search } },
          { website: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };

    const page = q.page ?? 1;
    const perPage = q.perPage ?? 25;

    // Importante: no Postgres, "ORDER BY col DESC" coloca NULLs PRIMEIRO por
    // padrão. Pra leads sem score (não analisados ainda), isso fazia eles
    // empurrarem os leads com score reais pra trás — usuário via página 1
    // toda com "—". Forçamos `nulls: 'last'` pra inverter esse comportamento
    // quando o sort é por um campo nullable.
    const sortBy = q.sortBy ?? 'leadScore';
    const sortDir = q.sortDir ?? 'desc';
    const nullableSortFields = ['leadScore', 'opportunityScore', 'estimatedTicket'];
    const orderBy: Prisma.LeadOrderByWithRelationInput = nullableSortFields.includes(
      sortBy,
    )
      ? { [sortBy]: { sort: sortDir, nulls: 'last' } }
      : { [sortBy]: sortDir };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findById(teamId: string, id: string): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, teamId },
      include: {
        interactions: { orderBy: { occurredAt: 'desc' }, take: 50 },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        pipelineStage: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  // ---------------------------------------------------------------------------
  // CRIAÇÃO MANUAL
  // ---------------------------------------------------------------------------

  /**
   * Cria um lead manualmente (formulário do app).
   * Detecta duplicata por cnpj dentro do team.
   * Dispara análise IA automaticamente.
   */
  async createManual(
    teamId: string,
    userId: string,
    dto: CreateManualLeadDto,
  ): Promise<Lead> {
    // Detecção de duplicata por CNPJ
    if (dto.cnpj) {
      const existing = await this.prisma.lead.findFirst({
        where: { teamId, cnpj: dto.cnpj },
      });
      if (existing) {
        this.logger.warn(`Lead duplicado por CNPJ ${dto.cnpj}: ${existing.name}`);
        throw new ConflictException(
          `Já existe um lead com esse CNPJ: "${existing.name}"`,
        );
      }
    }

    // Busca o primeiro estágio do pipeline pra colocar automaticamente
    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { teamId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const lead = await this.prisma.lead.create({
      data: {
        teamId,
        name: dto.name,
        legalName: dto.legalName,
        cnpj: dto.cnpj,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        instagram: dto.instagram,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        niche: dto.niche,
        description: dto.description,
        notes: dto.notes,
        googleRating: dto.googleRating,
        googleReviews: dto.googleReviews,
        tags: dto.tags ?? [],
        sourceKind: 'MANUAL',
        pipelineStageId: firstStage?.id,
      },
    });

    // Dispara análise IA em background
    await this.enqueueAnalysis(teamId, [lead.id]);
    this.logger.log(`Lead manual criado: ${lead.name} (${lead.id})`);

    // Registra evento de criação no histórico
    await this.recordEvent(lead.id, userId, 'CREATED', {
      description: `Lead criado manualmente`,
      source: 'MANUAL',
    });

    return lead;
  }

  // ---------------------------------------------------------------------------
  // IMPORT BATCH (CSV/EXCEL)
  // ---------------------------------------------------------------------------

  /**
   * Importa um batch de leads (parseados pelo frontend).
   * Faz upsert por CNPJ quando possível, senão cria.
   * Dispara análise IA pra todos.
   *
   * Retorna { created, updated, skipped, errors }.
   */
  async importBatch(
    teamId: string,
    userId: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<{
    created: number;
    duplicates: number;
    total: number;
    leadIds: string[];
  }> {
    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { teamId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    let created = 0;
    let duplicates = 0;
    const leadIds: string[] = [];

    for (const row of rows) {
      const name = String(row.name ?? row.nome ?? '').trim();
      if (!name || name.length < 2) continue;

      const cnpj = String(row.cnpj ?? row.CNPJ ?? '').trim() || undefined;
      const phone = String(row.phone ?? row.telefone ?? row.tel ?? '').trim() || undefined;
      const email = String(row.email ?? row.Email ?? '').trim() || undefined;
      const website = String(row.website ?? row.site ?? '').trim() || undefined;
      const instagram = String(row.instagram ?? row.Instagram ?? '').trim() || undefined;
      const city = String(row.city ?? row.cidade ?? '').trim() || undefined;
      const state = String(row.state ?? row.estado ?? row.uf ?? row.UF ?? '').trim() || undefined;
      const niche = String(row.niche ?? row.nicho ?? row.segmento ?? '').trim() || undefined;
      const address = String(row.address ?? row.endereco ?? row.endereço ?? '').trim() || undefined;
      const notes = String(row.notes ?? row.notas ?? row.observacao ?? row.observações ?? '').trim() || undefined;

      // Duplicata por CNPJ
      if (cnpj) {
        const existing = await this.prisma.lead.findFirst({
          where: { teamId, cnpj },
          select: { id: true },
        });
        if (existing) {
          duplicates++;
          leadIds.push(existing.id);
          continue;
        }
      }

      const lead = await this.prisma.lead.create({
        data: {
          teamId,
          name,
          cnpj,
          phone,
          email,
          website,
          instagram,
          city,
          state,
          niche,
          address,
          notes,
          tags: [],
          sourceKind: 'IMPORT',
          pipelineStageId: firstStage?.id,
        },
      });

      leadIds.push(lead.id);
      created++;

      // Registra evento (best-effort — não bloqueia se falhar)
      await this.recordEvent(lead.id, userId, 'IMPORTED', {
        description: 'Lead importado de planilha',
        source: 'IMPORT',
      });
    }

    // Dispara análise IA pra todos
    if (leadIds.length > 0) {
      await this.enqueueAnalysis(teamId, leadIds);
    }

    this.logger.log(
      `Import batch: ${created} criados, ${duplicates} duplicados (team=${teamId})`,
    );

    return {
      created,
      duplicates,
      total: rows.length,
      leadIds,
    };
  }

  async update(teamId: string, userId: string, id: string, dto: UpdateLeadDto): Promise<Lead> {
    // garante isolamento + pega valor anterior pra diff
    const before = await this.findById(teamId, id);

    const updated = await this.prisma.lead.update({ where: { id }, data: dto });

    // Detecta o que mudou pra gravar no histórico
    // Cada campo vira um evento separado (ex: TELEFONE_CHANGED, EMAIL_CHANGED)
    // ou um único UPDATED com lista de campos
    const changes: Array<{ field: string; from: unknown; to: unknown; description: string }> = [];

    const TRACKED_FIELDS: Array<{ key: keyof UpdateLeadDto; label: string }> = [
      { key: 'name', label: 'nome' },
      { key: 'phone', label: 'telefone' },
      { key: 'email', label: 'e-mail' },
      { key: 'pipelineStageId', label: 'estágio do pipeline' },
      { key: 'assignedToId', label: 'responsável' },
      { key: 'tags', label: 'tags' },
      { key: 'notes', label: 'notas' },
    ];

    for (const { key, label } of TRACKED_FIELDS) {
      if (dto[key] !== undefined) {
        const fromVal = (before as any)[key];
        const toVal = (updated as any)[key];
        const fromStr = fromVal == null ? '(vazio)' : String(fromVal);
        const toStr = toVal == null ? '(vazio)' : String(toVal);
        if (fromStr !== toStr) {
          changes.push({
            field: String(key),
            from: fromVal,
            to: toVal,
            description: `${label}: "${fromStr}" → "${toStr}"`,
          });
        }
      }
    }

    if (changes.length > 0) {
      // Caso especial: mudança de pipeline = STATUS_CHANGED
      const stageChange = changes.find((c) => c.field === 'pipelineStageId');
      if (stageChange) {
        await this.recordEvent(id, userId, 'STATUS_CHANGED', {
          description: 'Estágio do pipeline alterado',
          from: stageChange.from,
          to: stageChange.to,
        });
        // Remove pra não duplicar no UPDATED
      }

      const otherChanges = changes.filter((c) => c.field !== 'pipelineStageId');
      if (otherChanges.length > 0) {
        await this.recordEvent(id, userId, 'UPDATED', {
          description: otherChanges.length === 1
            ? `Campo alterado: ${otherChanges[0].description}`
            : `${otherChanges.length} campos alterados`,
          changes: otherChanges,
        });
      }
    }

    return updated;
  }

  async bulkAssign(teamId: string, userId: string, leadIds: string[], assignedToId: string): Promise<number> {
    const res = await this.prisma.lead.updateMany({
      where: { teamId, id: { in: leadIds } },
      data: { assignedToId },
    });

    // Registra evento ASSIGNED em cada lead
    for (const leadId of leadIds) {
      await this.recordEvent(leadId, userId, 'ASSIGNED', {
        description: 'Lead atribuído via ação em massa',
        assignedToId,
      });
    }

    return res.count;
  }

  // ---------------------------------------------------------------------------
  // PERSISTÊNCIA A PARTIR DE NORMALIZED LEADS (vindo dos providers)
  // ---------------------------------------------------------------------------

  /**
   * Persiste leads normalizados, fazendo upsert por:
   *  - teamId + cnpj (quando existe)
   *  - ou criando novo registro
   *
   * Retorna os IDs criados/atualizados para posterior disparo de IA.
   */
  async persistBatch(
    teamId: string,
    searchId: string | undefined,
    leads: NormalizedLead[],
  ): Promise<{ ids: string[]; created: number; updated: number }> {
    const ids: string[] = [];
    let created = 0;
    let updated = 0;

    for (const n of leads) {
      const data = this.mapToDbData(teamId, searchId, n);

      // Estratégia mais robusta: tenta upsert por CNPJ; se não tem CNPJ,
      // tenta achar por nome+cidade+team antes de criar (evita duplicatas
      // do Google Places onde CNPJ não vem)
      let lead;
      if (n.cnpj) {
        const existingByCnpj = await this.prisma.lead.findUnique({
          where: { teamId_cnpj: { teamId, cnpj: n.cnpj } },
          select: { id: true },
        });
        lead = existingByCnpj
          ? await this.prisma.lead.update({
              where: { id: existingByCnpj.id },
              data: this.mergeUpdate(data),
            })
          : await this.prisma.lead.create({ data });
        if (existingByCnpj) updated++;
        else created++;
      } else {
        // Busca por nome + cidade no team (case insensitive)
        const existing = await this.prisma.lead.findFirst({
          where: {
            teamId,
            name: { equals: n.name, mode: 'insensitive' },
            city: n.city ?? null,
          },
          select: { id: true },
        });
        if (existing) {
          lead = await this.prisma.lead.update({
            where: { id: existing.id },
            data: this.mergeUpdate(data),
          });
          updated++;
        } else {
          lead = await this.prisma.lead.create({ data });
          created++;
        }
      }
      ids.push(lead.id);
    }

    // Enfileira análise de IA em batch — uma task por lead, com backoff
    await this.aiQueue.addBulk(
      ids.map((leadId) => ({
        name: 'analyze-lead',
        data: { teamId, leadId },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 500,
        },
      })),
    );

    this.logger.log(
      `Persistidos ${ids.length} leads (team=${teamId}): ${created} novos, ${updated} atualizados`,
    );
    return { ids, created, updated };
  }

  // ---------------------------------------------------------------------------
  // APLICAÇÃO DE ANÁLISE DE IA (chamado pelo worker)
  // ---------------------------------------------------------------------------

  async applyAIAnalysis(
    id: string,
    payload: {
      leadScore: number;
      opportunityScore: number;
      temperature: 'COLD' | 'WARM' | 'HOT';
      estimatedTicket: number;
      insights: Prisma.JsonValue;
      valueReason: string;
    },
  ): Promise<void> {
    await this.prisma.lead.update({
      where: { id },
      data: {
        leadScore: payload.leadScore,
        opportunityScore: payload.opportunityScore,
        temperature: payload.temperature,
        estimatedTicket: payload.estimatedTicket,
        insights: payload.insights as Prisma.InputJsonValue,
        valueReason: payload.valueReason,
        aiAnalyzedAt: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS PRIVADOS
  // ---------------------------------------------------------------------------

  private mapToDbData(
    teamId: string,
    searchId: string | undefined,
    n: NormalizedLead,
  ): Prisma.LeadUncheckedCreateInput {
    return {
      teamId,
      searchId,
      name: n.name,
      legalName: n.legalName,
      cnpj: n.cnpj,
      phone: n.phone,
      whatsapp: n.whatsapp,
      email: n.email,
      website: n.website,
      instagram: n.instagram,
      facebook: n.facebook,
      address: n.address,
      city: n.city,
      state: n.state,
      country: n.country,
      zipCode: n.zipCode,
      latitude: n.latitude,
      longitude: n.longitude,
      niche: n.niche,
      description: n.description,
      googleRating: n.googleRating,
      googleReviews: n.googleReviews,
      sourceKind: n.sourceKind,
      externalIds: { [n.sourceKind]: n.sourceId },
    };
  }

  /**
   * Retorna stats de scoring pra debug — útil pra confirmar se os scores
   * estão de fato no banco ou se é problema de UI/cache.
   */
  async getScoreDebugStats(teamId: string): Promise<{
    total: number;
    withScore: number;
    withoutScore: number;
    sample: Array<{
      id: string;
      name: string;
      leadScore: number | null;
      opportunityScore: number | null;
      temperature: string | null;
      aiAnalyzedAt: Date | null;
    }>;
  }> {
    const [total, withScore, sample] = await Promise.all([
      this.prisma.lead.count({ where: { teamId } }),
      this.prisma.lead.count({
        where: { teamId, leadScore: { not: null } },
      }),
      this.prisma.lead.findMany({
        where: { teamId },
        select: {
          id: true,
          name: true,
          leadScore: true,
          opportunityScore: true,
          temperature: true,
          aiAnalyzedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      total,
      withScore,
      withoutScore: total - withScore,
      sample,
    };
  }

  /**
   * Re-enfileira análise de IA para os leadIds informados.
   * Usado pelo controller pra recalcular manualmente.
   */
  async enqueueAnalysis(
    teamId: string,
    leadIds: string[],
    userId?: string,
  ): Promise<{ enqueued: number }> {
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, teamId },
      select: { id: true },
    });

    await this.aiQueue.addBulk(
      leads.map((l) => ({
        name: 'analyze-lead',
        data: { teamId, leadId: l.id },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 500,
        },
      })),
    );

    this.logger.log(
      `Re-enfileirados ${leads.length} leads para análise IA (team=${teamId})`,
    );

    // Se foi reanálise individual feita pelo usuário, grava evento
    if (userId && leads.length === 1) {
      await this.recordEvent(leads[0].id, userId, 'REANALYZED', {
        description: 'Reanálise da IA solicitada manualmente',
      });
    }

    return { enqueued: leads.length };
  }

  /**
   * Re-enfileira análise para todos os leads do team SEM leadScore.
   * Útil pra processar backlog após mudança de provider de IA.
   */
  async enqueueAnalysisForPending(
    teamId: string,
  ): Promise<{ enqueued: number }> {
    const pending = await this.prisma.lead.findMany({
      where: { teamId, leadScore: null },
      select: { id: true },
      take: 500,
    });

    if (pending.length === 0) {
      return { enqueued: 0 };
    }

    return this.enqueueAnalysis(
      teamId,
      pending.map((l) => l.id),
    );
  }

  /**
   * No update, só sobrescrevemos campos NULOS no banco — preservamos
   * enriquecimentos feitos pela equipe (ex: email validado manualmente).
   */
  private mergeUpdate(data: Prisma.LeadUncheckedCreateInput): Prisma.LeadUpdateInput {
    return {
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      website: data.website ?? undefined,
      instagram: data.instagram ?? undefined,
      googleRating: data.googleRating ?? undefined,
      googleReviews: data.googleReviews ?? undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // HISTÓRICO / TIMELINE
  // ---------------------------------------------------------------------------

  /**
   * Helper interno: grava evento no histórico do lead.
   * Não bloqueia caller se falhar (history é log, nunca crítico).
   */
  private async recordEvent(
    leadId: string,
    userId: string | null,
    kind: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.leadEvent.create({
        data: {
          leadId,
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
   * Retorna timeline de eventos do lead.
   */
  async getHistory(teamId: string, id: string) {
    // Garante isolamento por team
    await this.findById(teamId, id);

    const events = await this.prisma.leadEvent.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return { events };
  }
}

/**
 * Retorna a data com hora 23:59:59.999 no mesmo dia.
 * Usado pra tornar o filtro `createdBefore` inclusivo do dia inteiro.
 */
function endOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
