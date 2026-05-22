// backend/src/modules/admin/guards/admin.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { AdminAuthService } from '../services/admin-auth.service';

export const ADMIN_ROLE_KEY = 'adminRole';
export const RequireAdminRole = (role: AdminRole) =>
  SetMetadata(ADMIN_ROLE_KEY, role);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token admin não fornecido');
    }

    let payload: any;
    try {
      payload = this.jwt.verify(authHeader.slice(7), {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token admin inválido');
    }

    if (!payload.isAdmin) {
      throw new ForbiddenException('Acesso restrito ao painel admin');
    }

    req.adminUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as AdminRole,
    };

    // Verificar role mínimo requerido pela rota
    const requiredRole = this.reflector.getAllAndOverride<AdminRole>(
      ADMIN_ROLE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (requiredRole && !AdminAuthService.canAccess(payload.role, requiredRole)) {
      throw new ForbiddenException(
        `Permissão insuficiente. Requer: ${requiredRole}`,
      );
    }

    return true;
  }
}

// ── Decorator CurrentAdmin ─────────────────────────────────────────────────
import { createParamDecorator } from '@nestjs/common';

export const CurrentAdmin = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return field ? req.adminUser?.[field] : req.adminUser;
  },
);
