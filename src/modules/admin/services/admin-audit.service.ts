import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export interface AuditLogInput {
  adminUserId: string;
  targetTeamId?: string;
  targetUserId?: string;
  action: string;
  description: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  reason?: string;
  ipAddress?: string;
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma ação administrativa. Chamado internamente pelos outros services. */
  async log(input: AuditLogInput): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminUserId:  input.adminUserId,
        targetTeamId: input.targetTeamId,
        targetUserId: input.targetUserId,
        action:       input.action,
        description:  input.description,
        before:       input.before ?? undefined,
        after:        input.after  ?? undefined,
        reason:       input.reason,
        ipAddress:    input.ipAddress,
      },
    });
  }

  async list(opts: {
    page: number;
    perPage: number;
    action?: string;
    adminUserId?: string;
    targetTeamId?: string;
  }) {
    const { page, perPage, action, adminUserId, targetTeamId } = opts;
    const where: any = {};
    if (action)       where.action      = { contains: action, mode: 'insensitive' };
    if (adminUserId)  where.adminUserId = adminUserId;
    if (targetTeamId) where.targetTeamId = targetTeamId;

    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          adminUser: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / perPage),
    };
  }
}
