-- CreateEnum
CREATE TYPE "WhatsappCampaignMediaType" AS ENUM ('text', 'image', 'video', 'document');

-- AlterTable
ALTER TABLE "WhatsappCampaign" ADD COLUMN     "attachmentId" INTEGER,
ADD COLUMN     "mediaType" "WhatsappCampaignMediaType" NOT NULL DEFAULT 'text',
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ALTER COLUMN "body" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "WhatsappCampaign_scheduledAt_idx" ON "WhatsappCampaign"("scheduledAt");

-- AddForeignKey
ALTER TABLE "WhatsappCampaign" ADD CONSTRAINT "WhatsappCampaign_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
