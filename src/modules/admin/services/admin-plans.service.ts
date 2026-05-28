import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AdminAuditService } from './admin-audit.service';

/** Mapeia nomes do frontend para nomes reais do schema Prisma */
function mapPlanInput(dto: Record<string, any>): Record<string, any> {
  const remap: Record<string, string | null> = {
    maxLeads:      'leadsQuota',
    maxSearches:   'searchesQuota',
    maxProposals:  'proposalsQuota',
    maxContracts:  'contractsQuota',
    maxAiCredits:  'aiCreditsQuota',
    maxMessages:   'messagesQuota',
    maxUsers:      'usersQuota',
    maxExports:    'exportsQuota',
    maxStorage:    'storageQuota',
    billingPeriod: null, // ignorado — não existe no schema
  };

  const allowDirect = new Set([
    'name', 'code', 'description', 'isActive', 'price', 'priceYearly',
    'leadsQuota', 'searchesQuota', 'proposalsQuota', 'contractsQuota',
    'messagesQuota', 'aiCreditsQuota', 'usersQuota', 'templatesQuota',
    'exportsQuota', 'storageQuota', 'automationsQuota', 'integrationsQuota',
  ]);

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (k in remap) {
      if (remap[k]) out[remap[k]!] = v;
    } else if (allowDirect.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { price: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      isActive: p.isActive,
      price: p.price,
      priceYearly: p.priceYearly,
      billingPeriod: 'MONTHLY',
      // Nomes que o frontend usa
      maxLeads:     p.leadsQuota,
      maxSearches:  (p as any).searchesQuota ?? 0,
      maxProposals: p.proposalsQuota,
      maxContracts: p.contractsQuota,
      maxAiCredits: p.aiCreditsQuota,
      maxMessages:  p.messagesQuota,
      maxUsers:     p.usersQuota,
      maxExports:   p.exportsQuota,
      // Nomes do schema também expostos (para outros consumidores)
      leadsQuota:    p.leadsQuota,
      searchesQuota: (p as any).searchesQuota ?? 0,
      proposalsQuota: p.proposalsQuota,
      contractsQuota: p.contractsQuota,
      aiCreditsQuota: p.aiCreditsQuota,
      messagesQuota:  p.messagesQuota,
      usersQuota:     p.usersQuota,
      exportsQuota:   p.exportsQuota,
      storageQuota:   p.storageQuota,
      _count: p._count,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async create(dto: any) {
    const data = mapPlanInput(dto);
    return this.prisma.plan.create({ data: data as any });
  }

  async update(id: string, dto: any, adminId?: string) {
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Plano não encontrado');

    const data = mapPlanInput(dto);
    const updated = await this.prisma.plan.update({ where: { id }, data: data as any });

    if (adminId) {
      await this.audit.log({
        adminUserId: adminId,
        action: 'PLAN_UPDATED',
        description: `Plano "${before.name}" atualizado`,
        before: { price: before.price, leadsQuota: before.leadsQuota, proposalsQuota: before.proposalsQuota },
        after:  { price: updated.price, leadsQuota: updated.leadsQuota, proposalsQuota: updated.proposalsQuota },
      });
    }

    return updated;
  }

  async deactivate(id: string, adminId?: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const updated = await this.prisma.plan.update({ where: { id }, data: { isActive: false } });

    if (adminId) {
      await this.audit.log({
        adminUserId: adminId,
        action: 'PLAN_DEACTIVATED',
        description: `Plano "${plan.name}" desativado`,
      });
    }

    return updated;
  }
}
