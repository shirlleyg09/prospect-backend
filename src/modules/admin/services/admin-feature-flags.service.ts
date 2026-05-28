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
    const totalTeams = await this.prisma.team.count();
    const enabledStats = await this.prisma.featureFlag.groupBy({
      by: ['feature'],
      _count: { enabled: true },
      where: { enabled: true },
    });
    const statsMap = Object.fromEntries(enabledStats.map((s) => [s.feature, s._count.enabled]));

    return ALL_FEATURES.map((f) => ({
      feature: f,
      enabledCount: statsMap[f] ?? 0,
      totalTeams,
    }));
  }

  async toggle(teamId: string, feature: string, enabled?: boolean, notes?: string) {
    // If enabled is not provided, flip the current value
    const current = await this.prisma.featureFlag.findUnique({
      where: { teamId_feature: { teamId, feature } },
    });
    const newEnabled = enabled !== undefined ? enabled : !(current?.enabled ?? false);

    return this.prisma.featureFlag.upsert({
      where: { teamId_feature: { teamId, feature } },
      create: { teamId, feature, enabled: newEnabled, notes },
      update: { enabled: newEnabled, notes },
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
