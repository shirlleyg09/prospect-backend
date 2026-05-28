import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { page: number; perPage: number; search?: string; status?: string; planCode?: string }) {
    const { page, perPage, search, status, planCode } = opts;
    const skip = (page - 1) * perPage;

    const subscriptionWhere: any = {};
    if (status) subscriptionWhere.status = status;

    const teamWhere: any = {};
    if (search) {
      teamWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where: teamWhere,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            where: subscriptionWhere,
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              memberships: true,
              leads: true,
              searches: true,
              proposals: true,
              contracts: true,
            },
          },
        },
      }),
      this.prisma.team.count({ where: teamWhere }),
    ]);

    const items = teams.map((t) => {
      const sub = t.subscriptions[0] ?? null;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt,
        subscription: sub ? {
          id: sub.id,
          status: sub.status,
          planName: sub.plan?.name ?? t.plan,
          planCode: sub.plan?.code ?? t.plan,
          price: sub.plan?.price ?? 0,
          expiresAt: sub.expiresAt,
          trialEndsAt: sub.trialEndsAt,
          nextDueAt: sub.nextDueAt,
          isOverdue: sub.isOverdue,
          paymentMethod: sub.paymentMethod,
        } : null,
        counts: t._count,
      };
    });

    return { items, total, page, perPage };
  }

  async getOne(teamId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        memberships: {
          include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
        },
        usageCounters: true,
        featureFlags: true,
        providerConfigs: { select: { id: true, kind: true, name: true, enabled: true } },
        supportTickets: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: {
          select: { leads: true, searches: true, proposals: true, contracts: true },
        },
      },
    });

    const sub = team.subscriptions[0] ?? null;
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      plan: team.plan,
      createdAt: team.createdAt,
      subscription: sub,
      members: team.memberships.map((m) => m.user),
      usageCounters: team.usageCounters,
      featureFlags: team.featureFlags,
      providers: team.providerConfigs,
      recentTickets: team.supportTickets,
      counts: team._count,
    };
  }

  async updateStatus(teamId: string, status: string, reason?: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { teamId } });
    if (!sub) throw new Error('Subscription not found for team');

    return this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: status as any,
        adminNotes: reason ? `[${new Date().toISOString().slice(0, 10)}] ${status}: ${reason}` : undefined,
      },
    });
  }

  async changePlan(teamId: string, planId: string, notes?: string) {
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    const sub = await this.prisma.subscription.findFirst({ where: { teamId } });

    if (sub) {
      return this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          planId,
          adminNotes: notes ? `[${new Date().toISOString().slice(0, 10)}] Plano alterado para ${plan.name}: ${notes}` : undefined,
        },
      });
    }
    return this.prisma.subscription.create({
      data: { teamId, planId, status: 'ACTIVE' as any },
    });
  }

  async updateLimits(teamId: string, limits: Record<string, number>) {
    const sub = await this.prisma.subscription.findFirst({ where: { teamId } });
    if (!sub) throw new Error('Subscription not found');

    const allowedFields = [
      'customLeadsQuota', 'customProposalsQuota', 'customContractsQuota',
      'customMessagesQuota', 'customAiCreditsQuota', 'customUsersQuota',
      'customTemplatesQuota', 'customExportsQuota',
    ];
    const data: any = {};
    for (const [k, v] of Object.entries(limits)) {
      if (allowedFields.includes(k)) data[k] = v;
    }
    return this.prisma.subscription.update({ where: { id: sub.id }, data });
  }
}
