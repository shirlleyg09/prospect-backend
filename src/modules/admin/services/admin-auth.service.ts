// backend/src/modules/admin/services/admin-auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma.service';
import { AdminRole } from '@prisma/client';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      isAdmin: true,
    };

    return {
      access_token: this.jwt.sign(payload),
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  async validateAdmin(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException();
    return admin;
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) throw new ForbiddenException('Senha atual incorreta');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: hash },
    });
    return { ok: true };
  }

  /** Verifica se o admin tem permissão para a ação */
  static canAccess(role: AdminRole, requiredRole: AdminRole): boolean {
    const hierarchy: Record<AdminRole, number> = {
      SUPER_ADMIN: 4,
      ADMIN_FINANCIAL: 3,
      ADMIN_SUPPORT: 2,
      ADMIN_READ: 1,
    };
    return hierarchy[role] >= hierarchy[requiredRole];
  }
}
