/**
 * @file crm.service.ts
 * @description
 *   Gerencia o pipeline visual (Kanban) e movimentações de leads entre estágios.
 *   Posição dentro do estágio é guardada em `lead.pipelinePosition`
 *   (inteiros esparsos para facilitar drag-and-drop sem recalcular tudo).
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface KanbanBoard {
  stages: Array<{
    id: string;
    kind: string;
    name: string;
    color: string | null;
    order: number;
    leadsCount: number;
    leads: Array<{
      id: string;
      name: string;
      niche: string | null;
      city: string | null;
      leadScore: number | null;
      temperature: string | null;
      estimatedTicket: string | null;
      proposalStatus: string | null;
      assignedTo: { id: string; name: string } | null;
      position: number;
    }>;
  }>;
}

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(teamId: string): Promise<KanbanBoard> {
    const stages = await this.prisma.pipelineStage.findMany({
      where: { teamId },
      orderBy: { order: 'asc' },
      include: {
        leads: {
          orderBy: { pipelinePosition: 'asc' },
          take: 100,
          select: {
            id: true,
            name: true,
            niche: true,
            city: true,
            leadScore: true,
            temperature: true,
            estimatedTicket: true,
            lastProposalStatus: true,
            pipelinePosition: true,
            notes: true,
            assignedTo: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      stages: stages.map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        color: s.color,
        order: s.order,
        leadsCount: s.leads.length,
        leads: s.leads.map((l) => ({
          id: l.id,
          name: l.name,
          niche: l.niche,
          city: l.city,
          leadScore: l.leadScore,
          temperature: l.temperature,
          estimatedTicket: l.estimatedTicket?.toString() ?? null,
          proposalStatus: l.lastProposalStatus,
          assignedTo: l.assignedTo,
          position: l.pipelinePosition,
          notes: l.notes ?? null,
        })),
      })),
    };
  }

  /**
   * Move um lead para outro estágio / posição.
   *
   * Estratégia: posições começam espaçadas (10, 20, 30...). Quando um lead
   * é inserido entre dois, usamos a média. Quando acaba o espaço, rodamos
   * um rebalanceamento na coluna.
   */
  async moveLead(
    teamId: string,
    leadId: string,
    targetStageId: string,
    targetIndex: number,
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, teamId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: targetStageId, teamId },
    });
    if (!stage) throw new NotFoundException('Estágio não encontrado');

    const leadsInStage = await this.prisma.lead.findMany({
      where: { teamId, pipelineStageId: targetStageId, NOT: { id: leadId } },
      orderBy: { pipelinePosition: 'asc' },
      select: { id: true, pipelinePosition: true },
    });

    const clampedIndex = Math.max(0, Math.min(targetIndex, leadsInStage.length));
    const before = leadsInStage[clampedIndex - 1]?.pipelinePosition;
    const after = leadsInStage[clampedIndex]?.pipelinePosition;

    let newPosition: number;
    if (before === undefined && after === undefined) newPosition = 1000;
    else if (before === undefined) newPosition = after! - 100;
    else if (after === undefined) newPosition = before + 100;
    else newPosition = Math.floor((before + after) / 2);

    // Se esgotou o espaço entre vizinhos, rebalanceia
    if (
      after !== undefined &&
      before !== undefined &&
      after - before <= 1
    ) {
      await this.rebalance(teamId, targetStageId);
      return this.moveLead(teamId, leadId, targetStageId, targetIndex);
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { pipelineStageId: targetStageId, pipelinePosition: newPosition },
    });
  }

  private async rebalance(teamId: string, stageId: string): Promise<void> {
    const leads = await this.prisma.lead.findMany({
      where: { teamId, pipelineStageId: stageId },
      orderBy: { pipelinePosition: 'asc' },
      select: { id: true },
    });

    await this.prisma.$transaction(
      leads.map((l, i) =>
        this.prisma.lead.update({
          where: { id: l.id },
          data: { pipelinePosition: (i + 1) * 1000 },
        }),
      ),
    );
  }
}
