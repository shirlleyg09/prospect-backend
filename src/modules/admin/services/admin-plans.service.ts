import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { price: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans;
  }

  async create(dto: any) {
    return this.prisma.plan.create({ data: dto });
  }

  async update(id: string, dto: any) {
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    return this.prisma.plan.update({ where: { id }, data: { isActive: false } });
  }
}
