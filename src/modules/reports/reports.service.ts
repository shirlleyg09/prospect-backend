import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type ReportPeriod = '7d' | '30d' | '90d' | '1y';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Funil de conversão pro período: leads → propostas → aprovadas.
   * Calcula % de conversão entre cada etapa.
   */
  async getConversionFunnel(teamId: string, period: ReportPeriod) {
    const since = this.getSinceDate(period);

    const [totalLeads, withProposal, approved] = await Promise.all([
      this.prisma.lead.count({
        where: { teamId, createdAt: { gte: since } },
      }),
      this.prisma.lead.count({
        where: {
          teamId,
          createdAt: { gte: since },
          proposals: { some: {} },
        },
      }),
      this.prisma.lead.count({
        where: {
          teamId,
          createdAt: { gte: since },
          proposals: { some: { status: 'APROVADA' } },
        },
      }),
    ]);

    const proposalRate = totalLeads > 0 ? (withProposal / totalLeads) * 100 : 0;
    const approvalRate = withProposal > 0 ? (approved / withProposal) * 100 : 0;
    const overallRate = totalLeads > 0 ? (approved / totalLeads) * 100 : 0;

    return {
      period,
      stages: [
        { name: 'Leads', count: totalLeads, percentage: 100 },
        {
          name: 'Com proposta',
          count: withProposal,
          percentage: Math.round(proposalRate * 10) / 10,
        },
        {
          name: 'Aprovadas',
          count: approved,
          percentage: Math.round(approvalRate * 10) / 10,
        },
      ],
      overallConversionRate: Math.round(overallRate * 10) / 10,
    };
  }

  /**
   * Receita acumulada por mês (últimos 12 meses).
   */
  async getRevenueByMonth(teamId: string) {
    const result: Array<{
      month: string;
      revenue: number;
      proposalsApproved: number;
    }> = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const [revAgg, approvedCount] = await Promise.all([
        this.prisma.revenue.aggregate({
          where: {
            teamId,
            closedAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),
        this.prisma.proposal.count({
          where: {
            teamId,
            status: 'APROVADA',
            approvedAt: { gte: start, lte: end },
          },
        }),
      ]);

      result.push({
        month: label,
        revenue: revAgg._sum.amount ?? 0,
        proposalsApproved: approvedCount,
      });
    }

    return result;
  }

  /**
   * Performance de propostas: enviadas vs aprovadas vs rejeitadas vs em aberto
   */
  async getProposalsBreakdown(teamId: string, period: ReportPeriod) {
    const since = this.getSinceDate(period);

    const [draft, sent, viewed, negotiating, approved, rejected, expired] =
      await Promise.all([
        this.prisma.proposal.count({
          where: { teamId, status: 'RASCUNHO', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'ENVIADA', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'VISUALIZADA', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'EM_NEGOCIACAO', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'APROVADA', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'REJEITADA', createdAt: { gte: since } },
        }),
        this.prisma.proposal.count({
          where: { teamId, status: 'EXPIRADA', createdAt: { gte: since } },
        }),
      ]);

    const total = draft + sent + viewed + negotiating + approved + rejected + expired;
    const closed = approved + rejected;
    const winRate = closed > 0 ? (approved / closed) * 100 : 0;

    return {
      period,
      total,
      breakdown: [
        { status: 'RASCUNHO', label: 'Rascunhos', count: draft, color: '#94a3b8' },
        { status: 'ENVIADA', label: 'Enviadas', count: sent, color: '#3b82f6' },
        { status: 'VISUALIZADA', label: 'Visualizadas', count: viewed, color: '#a855f7' },
        { status: 'EM_NEGOCIACAO', label: 'Em negociação', count: negotiating, color: '#f59e0b' },
        { status: 'APROVADA', label: 'Aprovadas', count: approved, color: '#10b981' },
        { status: 'REJEITADA', label: 'Rejeitadas', count: rejected, color: '#ef4444' },
        { status: 'EXPIRADA', label: 'Expiradas', count: expired, color: '#6b7280' },
      ],
      winRate: Math.round(winRate * 10) / 10,
    };
  }

  /**
   * Tempo médio entre publicação e decisão (aprovação/rejeição) — em dias.
   * Indicador de velocidade do funil.
   */
  async getAverageDecisionTime(teamId: string, period: ReportPeriod) {
    const since = this.getSinceDate(period);

    const proposals = await this.prisma.proposal.findMany({
      where: {
        teamId,
        publishedAt: { not: null, gte: since },
        OR: [{ approvedAt: { not: null } }, { rejectedAt: { not: null } }],
      },
      select: {
        publishedAt: true,
        approvedAt: true,
        rejectedAt: true,
        status: true,
      },
    });

    if (proposals.length === 0) {
      return {
        averageDays: 0,
        approvedAvgDays: 0,
        rejectedAvgDays: 0,
        sampleSize: 0,
      };
    }

    const approvedDeltas: number[] = [];
    const rejectedDeltas: number[] = [];

    for (const p of proposals) {
      if (!p.publishedAt) continue;
      const decisionDate = p.approvedAt ?? p.rejectedAt;
      if (!decisionDate) continue;
      const days =
        (decisionDate.getTime() - p.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (p.status === 'APROVADA') approvedDeltas.push(days);
      else if (p.status === 'REJEITADA') rejectedDeltas.push(days);
    }

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;

    const allDeltas = [...approvedDeltas, ...rejectedDeltas];

    return {
      averageDays: avg(allDeltas),
      approvedAvgDays: avg(approvedDeltas),
      rejectedAvgDays: avg(rejectedDeltas),
      sampleSize: allDeltas.length,
    };
  }

  /**
   * Top 10 leads mais qualificados (maior leadScore).
   */
  async getTopLeads(teamId: string, limit = 10) {
    return this.prisma.lead.findMany({
      where: { teamId, leadScore: { not: null } },
      orderBy: [{ leadScore: 'desc' }, { opportunityScore: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        niche: true,
        city: true,
        state: true,
        leadScore: true,
        opportunityScore: true,
        temperature: true,
        estimatedTicket: true,
      },
    });
  }

  /**
   * Resumo geral pra página de relatórios — todos os números num só endpoint.
   */
  async getSummary(teamId: string, period: ReportPeriod) {
    const [funnel, breakdown, decisionTime, monthlyRevenue, topLeads] = await Promise.all([
      this.getConversionFunnel(teamId, period),
      this.getProposalsBreakdown(teamId, period),
      this.getAverageDecisionTime(teamId, period),
      this.getRevenueByMonth(teamId),
      this.getTopLeads(teamId, 10),
    ]);

    return {
      period,
      funnel,
      proposalsBreakdown: breakdown,
      decisionTime,
      monthlyRevenue,
      topLeads,
    };
  }

  // -------- Helpers --------

  private getSinceDate(period: ReportPeriod): Date {
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
}
