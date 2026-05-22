// backend/src/modules/admin/services/admin-dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const period = now.toISOString().slice(0, 7); // YYYY-MM

    // ── Usuários ──────────────────────────────────────────────────────────────
    const [totalTeams, newTeams30d, newTeams7d] = await Promise.all([
      this.prisma.team.count(),
      this.prisma.team.count({ where: { createdAt: { gte: last30d } } }),
      this.prisma.team.count({ where: { createdAt: { gte: last7d } } }),
    ]);

    // ── Assinaturas ───────────────────────────────────────────────────────────
    const [subsByStatus, expiringSoon] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: {
            gte: now,
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of subsByStatus) statusMap[s.status] = s._count;

    // ── Planos ────────────────────────────────────────────────────────────────
    const planUsage = await this.prisma.subscription.groupBy({
      by: ['planId'],
      _count: true,
      where: { status: { in: ['ACTIVE', 'TRIAL', 'COURTESY'] } },
    });

    const planDetails = await this.prisma.plan.findMany({
      select: { id: true, name: true, code: true, price: true },
    });

    const plansWithCount = planDetails.map((p) => ({
      ...p,
      count: planUsage.find((pu) => pu.planId === p.id)?._count ?? 0,
    }));

    // Receita estimada (count de pagantes * preço do plano)
    let estimatedMRR = 0;
    for (const p of plansWithCount) {
      if (p.code !== 'free') {
        estimatedMRR += p.count * p.price;
      }
    }

    // ── Consumo total (mês atual) ─────────────────────────────────────────────
    const usageAgg = await this.prisma.usageCounter.aggregate({
      where: { period },
      _sum: {
        leadsUsed: true,
        proposalsUsed: true,
        contractsUsed: true,
        messagesUsed: true,
        aiCreditsUsed: true,
        exportsUsed: true,
      },
    });

    // ── Alertas não lidos ─────────────────────────────────────────────────────
    const alertsCount = await this.prisma.adminAlert.count({
      where: { isRead: false },
    });

    // ── Cadastros por dia (últimos 30 dias) ────────────────────────────────────
    const teamsByDay = await this.prisma.$queryRaw<Array<{ date: string; count: number }>>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::int as count
      FROM "Team"
      WHERE "createdAt" >= ${last30d}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // ── Tickets abertos ────────────────────────────────────────────────────────
    const openTickets = await this.prisma.supportTicket.count({
      where: { status: { in: ['open', 'in_progress'] } },
    });

    return {
      users: {
        total: totalTeams,
        active: statusMap['ACTIVE'] ?? 0,
        trial: statusMap['TRIAL'] ?? 0,
        pending: statusMap['PENDING'] ?? 0,
        canceled: statusMap['CANCELED'] ?? 0,
        blocked: 0, // implementar field no Team
        newLast30d: newTeams30d,
        newLast7d: newTeams7d,
      },
      subscriptions: {
        active: statusMap['ACTIVE'] ?? 0,
        trial: statusMap['TRIAL'] ?? 0,
        pending: statusMap['PENDING'] ?? 0,
        canceled: statusMap['CANCELED'] ?? 0,
        expired: statusMap['EXPIRED'] ?? 0,
        courtesy: statusMap['COURTESY'] ?? 0,
        expiringSoon,
      },
      revenue: {
        estimatedMRR,
        estimatedARR: estimatedMRR * 12,
      },
      plans: plansWithCount,
      usage: {
        period,
        leadsTotal: usageAgg._sum.leadsUsed ?? 0,
        proposalsTotal: usageAgg._sum.proposalsUsed ?? 0,
        contractsTotal: usageAgg._sum.contractsUsed ?? 0,
        messagesTotal: usageAgg._sum.messagesUsed ?? 0,
        aiCreditsTotal: usageAgg._sum.aiCreditsUsed ?? 0,
        exportsTotal: usageAgg._sum.exportsUsed ?? 0,
      },
      alerts: { unread: alertsCount },
      openTickets,
      teamsByDay,
    };
  }

  async getRecentActivity(limit = 20) {
    const logs = await this.prisma.adminAuditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        adminUser: { select: { name: true, email: true } },
      },
    });
    return logs;
  }

  async getAlerts(resolved = false) {
    return this.prisma.adminAlert.findMany({
      where: { resolvedAt: resolved ? { not: null } : null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  async markAlertRead(alertId: string) {
    return this.prisma.adminAlert.update({
      where: { id: alertId },
      data: { isRead: true, resolvedAt: new Date() },
    });
  }

  async generateAlerts() {
    // Gerar alertas automáticos: quotas quase atingidas, assinaturas vencendo
    const period = new Date().toISOString().slice(0, 7);

    // Assinaturas vencendo em 3 dias
    const expiring = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      },
      include: { team: { select: { name: true } } },
    });

    for (const sub of expiring) {
      await this.prisma.adminAlert.upsert({
        where: { id: `expiring-${sub.teamId}` },
        create: {
          id: `expiring-${sub.teamId}`,
          teamId: sub.teamId,
          kind: 'SUBSCRIPTION_EXPIRING',
          title: 'Assinatura vencendo',
          message: `${sub.team.name} tem assinatura vencendo em menos de 3 dias`,
          severity: 'warning',
        },
        update: {},
      });
    }

    return { generated: expiring.length };
  }
}
