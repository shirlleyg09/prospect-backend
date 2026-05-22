/**
 * @file dashboard.service.ts
 * @description
 *   KPIs e agregações para o dashboard. Usa queries agregadas (count/groupBy)
 *   do Prisma — em produção, considerar materialized views para teams grandes.
 */

import { Injectable } from '@nestjs/common';
import { LeadTemperature } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface DashboardKpis {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  avgLeadScore: number;
  opportunityRate: number; // % de leads HOT sobre total
  totalEstimatedTicket: number;
  leadsLast7d: number;
}

export interface NicheDistribution {
  niche: string;
  count: number;
}

export interface QualityDistribution {
  bucket: string; // "0-20", "21-40", etc
  count: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  score: number;
  name: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpis(teamId: string): Promise<DashboardKpis> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const [total, hot, warm, cold, scoreAgg, ticketAgg, last7d] = await Promise.all([
      this.prisma.lead.count({ where: { teamId } }),
      this.prisma.lead.count({ where: { teamId, temperature: LeadTemperature.HOT } }),
      this.prisma.lead.count({ where: { teamId, temperature: LeadTemperature.WARM } }),
      this.prisma.lead.count({ where: { teamId, temperature: LeadTemperature.COLD } }),
      this.prisma.lead.aggregate({
        where: { teamId, leadScore: { not: null } },
        _avg: { leadScore: true },
      }),
      this.prisma.lead.aggregate({
        where: { teamId, estimatedTicket: { not: null } },
        _sum: { estimatedTicket: true },
      }),
      this.prisma.lead.count({ where: { teamId, createdAt: { gte: weekAgo } } }),
    ]);

    return {
      totalLeads: total,
      hotLeads: hot,
      warmLeads: warm,
      coldLeads: cold,
      avgLeadScore: Math.round(scoreAgg._avg.leadScore ?? 0),
      opportunityRate: total > 0 ? Math.round((hot / total) * 100) : 0,
      totalEstimatedTicket: Number(ticketAgg._sum.estimatedTicket ?? 0),
      leadsLast7d: last7d,
    };
  }

  async getNicheDistribution(teamId: string, limit = 10): Promise<NicheDistribution[]> {
    const rows = await this.prisma.lead.groupBy({
      by: ['niche'],
      where: { teamId, niche: { not: null } },
      _count: { niche: true },
      orderBy: { _count: { niche: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ niche: r.niche ?? 'Sem classificação', count: r._count.niche }));
  }

  async getQualityDistribution(teamId: string): Promise<QualityDistribution[]> {
    // Usa SQL raw para binning — mais eficiente que múltiplos counts
    const rows = await this.prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN "leadScore" IS NULL THEN 'N/A'
          WHEN "leadScore" <= 20 THEN '0-20'
          WHEN "leadScore" <= 40 THEN '21-40'
          WHEN "leadScore" <= 60 THEN '41-60'
          WHEN "leadScore" <= 80 THEN '61-80'
          ELSE '81-100'
        END AS bucket,
        COUNT(*)::bigint AS count
      FROM "Lead"
      WHERE "teamId" = ${teamId}
      GROUP BY bucket
      ORDER BY bucket;
    `;
    return rows.map((r) => ({ bucket: r.bucket, count: Number(r.count) }));
  }

  async getGeoHeatmap(teamId: string, limit = 1000): Promise<GeoPoint[]> {
    const leads = await this.prisma.lead.findMany({
      where: {
        teamId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        name: true,
        latitude: true,
        longitude: true,
        leadScore: true,
      },
      take: limit,
      orderBy: { leadScore: 'desc' },
    });

    return leads.map((l) => ({
      lat: l.latitude!,
      lng: l.longitude!,
      score: l.leadScore ?? 50,
      name: l.name,
    }));
  }
}
