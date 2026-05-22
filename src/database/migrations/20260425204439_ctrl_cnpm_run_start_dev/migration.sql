-- CreateEnum
CREATE TYPE "MessageTemplateCategory" AS ENUM ('PRIMEIRO_CONTATO', 'FOLLOW_UP', 'QUEBRA_OBJECAO', 'AGENDAMENTO', 'RETOMADA', 'CUSTOM');

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "aiPrompt" TEXT,
ADD COLUMN     "category" "MessageTemplateCategory" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "teamId" DROP NOT NULL,
ALTER COLUMN "body" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "MessageTemplate_category_idx" ON "MessageTemplate"("category");
