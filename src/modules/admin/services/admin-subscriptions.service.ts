import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AdminAuditService } from './admin-audit.service';

const ALLOWED_UPDATE_FIELDS = new Set([
  'status', 'planId', 'startsAt', 'expiresAt', 'trialEndsAt', 'canceledAt',
  'paymentMethod', 'lastPaidAt', 'nextDueAt', 'isOverdue', 'adminNotes',
  'customLeadsQuota', 'customProposalsQuota', 'customContractsQuota',
  'customMessagesQuota', 'customAiCreditsQuota', 'customUsersQuota',
  'customTemplatesQuota', 'customExportsQuota', 'customStorageQuota',
  'customAutomationsQuota', 'customIntegrationsQuota',
]);

function sanitize(dto: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (ALLOWED_UPDATE_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function mapSub(s: any) {
  return {
    ...s,
    // Aliases used by the frontend
    currentPeriodStart: s.startsAt,
    currentPeriodEnd: s.expiresAt ?? s.trialEndsAt ?? s.nextDueAt ?? null,
  };
}

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(opts: { page: number; perPage: number; status?: string; search?: string }) {
    const { page, perPage, status, search } = opts;
    const where: any = {};
    if (status) where.status = status;
    if (search) where.team = { name: { contains: search, mode: 'insensitive' } };

    const [subs, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          team: { select: { id: true, name: true, slug: true } },
          plan: { select: { id: true, name: true, code: true, price: true } },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      items: subs.map(mapSub),
      total,
      page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async update(id: string, dto: any, adminId?: string) {
    const before = await this.prisma.subscription.findUnique({
      where: { id },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!before) throw new NotFoundException('Assinatura não encontrada');

    const data = sanitize(dto);
    const updated = await this.prisma.subscription.update({ where: { id }, data });

    if (adminId) {
      await this.audit.log({
        adminUserId: adminId,
        targetTeamId: before.teamId,
        action: 'SUBSCRIPTION_UPDATED',
        description: `Assinatura do team "${before.team?.name}" atualizada`,
        before: { status: before.status, planId: before.planId },
        after: { status: updated.status, planId: updated.planId },
      });
    }

    return mapSub(updated);
  }

  async create(dto: {
    teamId: string;
    planId: string;
    status: string;
    startsAt?: string;
    expiresAt?: string;
    trialEndsAt?: string;
    paymentMethod?: string;
    adminNotes?: string;
  }, adminId?: string) {
    const data: any = {
      teamId: dto.teamId,
      planId: dto.planId,
      status: dto.status as any,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
    };
    if (dto.expiresAt)    data.expiresAt    = new Date(dto.expiresAt);
    if (dto.trialEndsAt)  data.trialEndsAt  = new Date(dto.trialEndsAt);
    if (dto.paymentMethod) data.paymentMethod = dto.paymentMethod;
    if (dto.adminNotes)   data.adminNotes   = dto.adminNotes;

    // Upsert — each team has at most one subscription (@@unique([teamId]))
    const sub = await this.prisma.subscription.upsert({
      where: { teamId: dto.teamId },
      create: data,
      update: data,
      include: {
        team: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true, code: true, price: true } },
      },
    });

    if (adminId) {
      await this.audit.log({
        adminUserId: adminId,
        targetTeamId: dto.teamId,
        action: 'SUBSCRIPTION_CREATED',
        description: `Assinatura criada/substituída para o team "${sub.team?.name}"`,
        after: { status: sub.status, planId: sub.planId },
      });
    }

    return mapSub(sub);
  }
}
