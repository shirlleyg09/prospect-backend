/**
 * @file auth.service.ts
 * @description
 *   Autenticação, registro e criação inicial de Team.
 *   Usa bcrypt (12 rounds) para senhas e JWT para tokens.
 *
 *   Fluxo de registro:
 *     1. Cria User
 *     2. Cria Team com o usuário como OWNER
 *     3. Popula PipelineStages padrão
 *     4. Retorna tokens
 */

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PipelineStageKind, Role, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';

interface RegisterDto {
  email: string;
  password: string;
  name: string;
  teamName: string;
}

interface LoginDto {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    teamId: string;
    role: Role;
  };
}

@Injectable()
export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, AuthService.BCRYPT_ROUNDS);
    const slug = this.slugify(dto.teamName);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });

      const team = await tx.team.create({
        data: { name: dto.teamName, slug: `${slug}-${user.id.slice(0, 6)}` },
      });

      await tx.membership.create({
        data: { userId: user.id, teamId: team.id, role: Role.OWNER },
      });

      // Pipeline padrão
      const stages: Array<[PipelineStageKind, string, string]> = [
        [PipelineStageKind.NEW, 'Novos', '#6366f1'],
        [PipelineStageKind.CONTACTED, 'Contatados', '#8b5cf6'],
        [PipelineStageKind.NEGOTIATING, 'Negociação', '#f59e0b'],
        [PipelineStageKind.WON, 'Fechados', '#10b981'],
        [PipelineStageKind.LOST, 'Perdidos', '#ef4444'],
      ];
      await tx.pipelineStage.createMany({
        data: stages.map(([kind, name, color], i) => ({
          teamId: team.id,
          kind,
          name,
          order: i,
          color,
        })),
      });

      // Assinatura free automática com trial de 14 dias
      const freePlan = await tx.plan.findUnique({ where: { code: 'free' } });
      if (freePlan) {
        await tx.subscription.create({
          data: {
            teamId: team.id,
            planId: freePlan.id,
            status: SubscriptionStatus.TRIAL,
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
        const period = new Date().toISOString().slice(0, 7);
        await tx.usageCounter.create({
          data: { teamId: team.id, period },
        });
      }

      return { user, teamId: team.id, role: Role.OWNER };
    });

    return this.issueTokens(result.user, result.teamId, result.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('Usuário sem team associado');

    return this.issueTokens(user, membership.teamId, membership.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      return this.issueTokens(user, payload.teamId, payload.role);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  // ---------------------------------------------------------------------------

  private issueTokens(
    user: { id: string; email: string; name: string },
    teamId: string,
    role: Role,
  ): TokenPair {
    const payload = { sub: user.id, email: user.email, teamId, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: '1h',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, teamId, role },
    };
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
