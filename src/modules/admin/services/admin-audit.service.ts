import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { page: number; perPage: number; action?: string; adminUserId?: string; targetTeamId?: string }) {
    const { page, perPage, action, adminUserId, targetTeamId } = opts;
    const where: any = {};
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (adminUserId) where.adminUserId = adminUserId;
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

    return { items, total, page, perPage };
  }
}
