import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type NotificationKind =
  | 'PROPOSAL_VIEWED'
  | 'PROPOSAL_REVISITED'
  | 'PROPOSAL_EXPIRING'
  | 'PROPOSAL_APPROVED'
  | 'PROPOSAL_REJECTED'
  | 'RECEIVABLE_DUE_SOON'
  | 'RECEIVABLE_OVERDUE'
  | 'LEAD_HOT';

export interface CreateNotificationInput {
  teamId: string;
  userId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria uma nova notificação.
   * Pode ser pra um usuário específico (userId) ou pra o team inteiro (userId null).
   */
  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        teamId: input.teamId,
        userId: input.userId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Cria notificação ANTI-DUPLICATA — só cria se não houve uma igual
   * nos últimos N minutos. Útil pra evitar spam (ex: cliente abrindo
   * a proposta 5 vezes em 1 minuto não gera 5 notificações).
   */
  async createDeduped(
    input: CreateNotificationInput,
    windowMinutes = 60,
  ) {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Procura notificação igual (mesmo kind + link) nesse team recentemente
    const recent = await this.prisma.notification.findFirst({
      where: {
        teamId: input.teamId,
        kind: input.kind,
        link: input.link,
        createdAt: { gte: since },
      },
    });

    if (recent) {
      this.logger.log(
        `Notificação duplicada (${input.kind}) suprimida — última há menos de ${windowMinutes}min`,
      );
      return null;
    }

    return this.create(input);
  }

  async list(teamId: string, opts?: { unreadOnly?: boolean; limit?: number }) {
    const where: Prisma.NotificationWhereInput = { teamId };
    if (opts?.unreadOnly) {
      where.readAt = null;
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { teamId, readAt: null },
    });

    return { notifications, unreadCount };
  }

  async markAsRead(teamId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, teamId },
    });
    if (!existing) return null;

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(teamId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { teamId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async delete(teamId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, teamId },
    });
    if (!existing) return null;

    await this.prisma.notification.delete({ where: { id } });
    return { deleted: true };
  }
}
