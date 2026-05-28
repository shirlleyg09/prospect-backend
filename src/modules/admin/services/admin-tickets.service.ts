import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { page: number; perPage: number; status?: string; priority?: string }) {
    const { page, perPage, status, priority } = opts;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          team: { select: { id: true, name: true } },
          replies: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async update(id: string, dto: any) {
    const data: any = {};
    if (dto.status) { data.status = dto.status; if (dto.status === 'resolved') data.resolvedAt = new Date(); }
    if (dto.assignedTo) data.assignedTo = dto.assignedTo;
    if (dto.priority) data.priority = dto.priority;
    return this.prisma.supportTicket.update({ where: { id }, data });
  }

  async reply(ticketId: string, message: string, adminId: string) {
    return this.prisma.supportReply.create({
      data: { ticketId, message, authorId: adminId, isAdmin: true },
    });
  }
}
