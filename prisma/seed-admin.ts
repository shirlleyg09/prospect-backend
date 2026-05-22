// backend/prisma/seed-admin.ts
// Rode: npx ts-node prisma/seed-admin.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding admin data...');

  // ── 1. Planos padrão ──────────────────────────────────────────────────────
  const plans = [
    {
      code: 'free',
      name: 'Free',
      description: 'Para experimentar e validar.',
      price: 0,
      priceYearly: 0,
      leadsQuota: 20,
      proposalsQuota: 3,
      contractsQuota: 1,
      messagesQuota: 20,
      aiCreditsQuota: 20,
      usersQuota: 1,
      templatesQuota: 3,
      exportsQuota: 2,
      storageQuota: 50,
      automationsQuota: 0,
      integrationsQuota: 0,
    },
    {
      code: 'starter',
      name: 'Starter',
      description: 'Para autônomos e freelancers.',
      price: 79,
      priceYearly: 790,
      leadsQuota: 200,
      proposalsQuota: 20,
      contractsQuota: 5,
      messagesQuota: 100,
      aiCreditsQuota: 200,
      usersQuota: 1,
      templatesQuota: 10,
      exportsQuota: 20,
      storageQuota: 500,
      automationsQuota: 0,
      integrationsQuota: 0,
    },
    {
      code: 'pro',
      name: 'Pro',
      description: 'Para pequenas agências e times.',
      price: 199,
      priceYearly: 1990,
      leadsQuota: 1000,
      proposalsQuota: 100,
      contractsQuota: 20,
      messagesQuota: 500,
      aiCreditsQuota: 1000,
      usersQuota: 3,
      templatesQuota: 50,
      exportsQuota: 100,
      storageQuota: 2000,
      automationsQuota: 5,
      integrationsQuota: 3,
    },
    {
      code: 'business',
      name: 'Business',
      description: 'Para agências consolidadas.',
      price: 499,
      priceYearly: 4990,
      leadsQuota: 5000,
      proposalsQuota: 999,
      contractsQuota: 100,
      messagesQuota: 999,
      aiCreditsQuota: 5000,
      usersQuota: 10,
      templatesQuota: 999,
      exportsQuota: 999,
      storageQuota: 10000,
      automationsQuota: 20,
      integrationsQuota: 10,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: { ...plan },
    });
    console.log(`  ✓ Plano ${plan.name} criado/atualizado`);
  }

  // ── 2. Admin padrão ────────────────────────────────────────────────────────
  const adminEmail = 'admin@prospect.app';
  const adminPassword = 'Admin@2026!';
  const hash = await bcrypt.hash(adminPassword, 12);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: 'Super Admin',
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
    update: {},
  });
  console.log(`  ✓ Admin criado: ${adminEmail} / ${adminPassword}`);

  // ── 3. Seed das assinaturas Free pra teams existentes ─────────────────────
  const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
  const teams = await prisma.team.findMany({ select: { id: true } });

  for (const team of teams) {
    const exists = await prisma.subscription.findUnique({
      where: { teamId: team.id },
    });
    if (!exists && freePlan) {
      await prisma.subscription.create({
        data: {
          teamId: team.id,
          planId: freePlan.id,
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.usageCounter.create({
        data: {
          teamId: team.id,
          period: new Date().toISOString().slice(0, 7),
        },
      });
    }
  }
  console.log(`  ✓ Assinaturas criadas para ${teams.length} teams`);

  console.log('✅ Seed admin concluído!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
