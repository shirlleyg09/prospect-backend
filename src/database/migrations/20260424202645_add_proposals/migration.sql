-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'ENVIADA', 'VISUALIZADA', 'EM_NEGOCIACAO', 'APROVADA', 'REJEITADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "ProposalTemplateCategory" AS ENUM ('DESIGN', 'WEB_DEV', 'CUSTOM');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lastProposalAt" TIMESTAMP(3),
ADD COLUMN     "lastProposalStatus" "ProposalStatus";

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "proposalsQuota" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "category" "ProposalTemplateCategory" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "outline" JSONB NOT NULL,
    "defaultPricing" JSONB,
    "aiPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "content" JSONB NOT NULL,
    "plans" JSONB NOT NULL,
    "paymentConditions" JSONB,
    "publicSlug" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "totalReadingTimeSec" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalView" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "readingTimeSec" INTEGER NOT NULL DEFAULT 0,
    "scrollDepthPct" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,

    CONSTRAINT "ProposalView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalRefinement" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "snapshotBefore" JSONB,
    "aiMeta" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalRefinement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalUsage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "refinementCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalTemplate_teamId_isActive_idx" ON "ProposalTemplate"("teamId", "isActive");

-- CreateIndex
CREATE INDEX "ProposalTemplate_category_idx" ON "ProposalTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_publicSlug_key" ON "Proposal"("publicSlug");

-- CreateIndex
CREATE INDEX "Proposal_teamId_status_idx" ON "Proposal"("teamId", "status");

-- CreateIndex
CREATE INDEX "Proposal_leadId_idx" ON "Proposal"("leadId");

-- CreateIndex
CREATE INDEX "Proposal_publicSlug_idx" ON "Proposal"("publicSlug");

-- CreateIndex
CREATE INDEX "Proposal_teamId_createdAt_idx" ON "Proposal"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "ProposalView_proposalId_viewedAt_idx" ON "ProposalView"("proposalId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProposalView_sessionId_idx" ON "ProposalView"("sessionId");

-- CreateIndex
CREATE INDEX "ProposalRefinement_proposalId_createdAt_idx" ON "ProposalRefinement"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "ProposalUsage_teamId_idx" ON "ProposalUsage"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalUsage_teamId_year_month_key" ON "ProposalUsage"("teamId", "year", "month");

-- AddForeignKey
ALTER TABLE "ProposalTemplate" ADD CONSTRAINT "ProposalTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRefinement" ADD CONSTRAINT "ProposalRefinement_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRefinement" ADD CONSTRAINT "ProposalRefinement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalUsage" ADD CONSTRAINT "ProposalUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uniq_team_cnpj" RENAME TO "Lead_teamId_cnpj_key";
