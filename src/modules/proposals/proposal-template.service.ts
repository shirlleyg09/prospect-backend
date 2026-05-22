/**
 * @file proposal-template.service.ts
 * @description
 *   Gerencia os ProposalTemplate.
 *
 *   - listForTeam: retorna templates globais (teamId=null) + do team, todos ativos
 *   - seedDefaults: roda na inicialização pra garantir que os templates globais existem
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_TEMPLATES } from './seed/proposal-templates.seed';

@Injectable()
export class ProposalTemplateService implements OnModuleInit {
  private readonly logger = new Logger(ProposalTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda uma vez na inicialização do módulo — cria os templates globais
   * se ainda não existirem. Idempotente.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.seedDefaults();
    } catch (err) {
      this.logger.error(
        `Falha ao seedar ProposalTemplates: ${(err as Error).message}`,
      );
    }
  }

  async seedDefaults(): Promise<void> {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.proposalTemplate.findFirst({
        where: { teamId: null, name: tpl.name },
      });

      if (!existing) {
        await this.prisma.proposalTemplate.create({
          data: {
            teamId: null,
            name: tpl.name,
            category: tpl.category,
            description: tpl.description,
            outline: tpl.outline as Prisma.InputJsonValue,
            defaultPricing: tpl.defaultPricing as unknown as Prisma.InputJsonValue,
            aiPrompt: tpl.aiPrompt,
            isActive: true,
          },
        });
        this.logger.log(`Template global seedado: ${tpl.name}`);
      }
    }
  }

  /**
   * Lista templates disponíveis pro team:
   *   - globais (teamId=null) ativos
   *   - do próprio team ativos
   */
  async listForTeam(teamId: string) {
    return this.prisma.proposalTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ teamId: null }, { teamId }],
      },
      orderBy: [{ teamId: 'asc' }, { name: 'asc' }], // globais primeiro
    });
  }
}
