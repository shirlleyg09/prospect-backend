/**
 * @file seed.ts
 * @description
 *   Popula o banco com dados de exemplo para desenvolvimento.
 *   Uso: `pnpm prisma:seed`
 */

import { PipelineStageKind, PrismaClient, ProviderKind, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // User + Team demo
  const passwordHash = await bcrypt.hash('prospect123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@prospect.dev' },
    update: {},
    create: {
      email: 'demo@prospect.dev',
      name: 'Demo User',
      passwordHash,
    },
  });

  const team = await prisma.team.upsert({
    where: { slug: 'demo-team' },
    update: {},
    create: {
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'free',
      leadsQuota: 500,
    },
  });

  await prisma.membership.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: {},
    create: { userId: user.id, teamId: team.id, role: Role.OWNER },
  });

  // Pipeline stages padrão
  const stages: Array<[PipelineStageKind, string, number, string]> = [
    [PipelineStageKind.NEW, 'Novos', 0, '#6366f1'],
    [PipelineStageKind.CONTACTED, 'Contatados', 1, '#8b5cf6'],
    [PipelineStageKind.NEGOTIATING, 'Negociação', 2, '#f59e0b'],
    [PipelineStageKind.WON, 'Fechados', 3, '#10b981'],
    [PipelineStageKind.LOST, 'Perdidos', 4, '#ef4444'],
  ];

  for (const [kind, name, order, color] of stages) {
    await prisma.pipelineStage.upsert({
      where: { teamId_kind: { teamId: team.id, kind } },
      update: { name, order, color },
      create: { teamId: team.id, kind, name, order, color },
    });
  }

  // Provider config de exemplo (desabilitado — precisa de creds reais)
  await prisma.providerConfig.upsert({
    where: { teamId_kind_name: { teamId: team.id, kind: ProviderKind.APIFY, name: 'apify-gmaps' } },
    update: {},
    create: {
      teamId: team.id,
      kind: ProviderKind.APIFY,
      name: 'apify-gmaps',
      enabled: false,
      priority: 100,
      secrets: { apiToken: 'REPLACE_ME' },
      config: { actorId: 'compass/crawler-google-places' },
    },
  });

  console.log('✅ Seed concluído!');
  console.log('   Email: demo@prospect.dev');
  console.log('   Senha: prospect123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
