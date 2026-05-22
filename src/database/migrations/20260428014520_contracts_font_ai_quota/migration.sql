-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "fontFamily" TEXT DEFAULT 'Arial';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "aiContractsQuota" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "aiContractsUsed" INTEGER NOT NULL DEFAULT 0;
