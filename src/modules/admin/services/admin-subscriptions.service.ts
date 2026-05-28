import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { page: number; perPage: number; status?: string; search?: string }) {
    const { page, perPage, status, search } = opts;
    const where: any = {};
    if (status) where.status = status;
    if (search) where.team = { name: { contains: search, mode: 'insensitive' } };

    const [items, total] = await Promise.all([
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

    return { items, total, page, perPage };
  }

  async update(id: string, dto: any) {
    return this.prisma.subscription.update({ where: { id }, data: dto });
  }
}
