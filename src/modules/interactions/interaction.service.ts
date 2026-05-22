/**
 * @file interaction.service.ts
 * @description
 *   Registra interações (ligação, whatsapp, email, reunião) com o lead.
 *   Serve de timeline para o CRM e dataset para análises futuras de cadência.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InteractionChannel, InteractionDirection } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';

export class CreateInteractionDto {
  @IsEnum(InteractionChannel) channel!: InteractionChannel;
  @IsEnum(InteractionDirection) direction!: InteractionDirection;
  @IsString() content!: string;
  @IsOptional() @IsString() outcome?: string;
}

@Injectable()
export class InteractionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, userId: string, leadId: string, dto: CreateInteractionDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, teamId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    return this.prisma.interaction.create({
      data: {
        leadId,
        userId,
        channel: dto.channel,
        direction: dto.direction,
        content: dto.content,
        outcome: dto.outcome,
      },
    });
  }

  async listByLead(teamId: string, leadId: string) {
    // garante isolamento por team
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, teamId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    return this.prisma.interaction.findMany({
      where: { leadId },
      orderBy: { occurredAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
  }
}
