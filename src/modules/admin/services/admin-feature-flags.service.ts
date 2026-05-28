import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

const ALL_FEATURES = [
  'leads_search', 'ai_qualification', 'kanban', 'export_pdf', 'export_excel',
  'proposals', 'contracts', 'contract_signing', 'financial', 'reports',
  'api_access', 'white_label', 'advanced_filters', 'bulk_actions',
  'team_collaboration', 'custom_templates', 'integrations', 'automations',
];

@Injectable()
export class AdminFeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(teamId?: string) {
    if (teamId) {
      const flags = await this.prisma.featureFlag.findMany({ where: { teamId } });
      const flagMap = Object.fromEntries(flags.map((f) => [f.feature, f]));
      return ALL_FEATURES.map((f) => ({
        feature: f,
        enabled: flagMap[f]?.enabled ?? false,
        notes: flagMap[f]?.notes,
        id: flagMap[f]?.id,
      }));
    }

    // Aggregate stats across all teams
    const stats = await this.prisma.featureFlag.groupBy({
      by: ['feature'],
      _count: { enabled: true },
      where: { enabled: true },
    });
    return stats;
  }

  async toggle(teamId: string, feature: string, enabled: boolean, notes?: string) {
    return this.prisma.featureFlag.upsert({
      where: { teamId_feature: { teamId, feature } },
      create: { teamId, feature, enabled, notes },
      update: { enabled, notes },
    });
  }

  async bulkUpdate(teamId: string, flags: Record<string, boolean>) {
    const ops = Object.entries(flags).map(([feature, enabled]) =>
      this.prisma.featureFlag.upsert({
        where: { teamId_feature: { teamId, feature } },
        create: { teamId, feature, enabled },
        update: { enabled },
      }),
    );
    return Promise.all(ops);
  }
}
