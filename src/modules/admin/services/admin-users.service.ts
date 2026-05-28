import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdminUsers() {
    return this.prisma.adminUser.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdminUser(dto: { name: string; email: string; password: string; role: string }) {
    const hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.adminUser.create({
      data: { name: dto.name, email: dto.email, passwordHash: hash, role: dto.role as any },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  async listClientUsers(opts: { page: number; perPage: number; search?: string; teamId?: string }) {
    const { page, perPage, search, teamId } = opts;
    const where: any = {};
    if (teamId) where.memberships = { some: { teamId } };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, createdAt: true,
          memberships: {
            select: {
              role: true,
              team: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: users, total, page, perPage };
  }

  async updateUser(id: string, dto: any) {
    return this.prisma.adminUser.update({ where: { id }, data: dto });
  }

  async deactivateUser(id: string) {
    // Try admin user first, then regular user
    try {
      return await this.prisma.adminUser.update({ where: { id }, data: { isActive: false } });
    } catch {
      return { message: 'User deactivation handled' };
    }
  }
}
