-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "WhatsappCampaignStatus" AS ENUM ('draft', 'running', 'paused', 'done', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "WhatsappCampaignItemStatus" AS ENUM ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "whapiMessageId" TEXT,
    "status" "WhatsappMessageStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "recipientId" INTEGER,
    "clientRef" TEXT,
    "campaignItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappWebhookLog" (
    "id" TEXT NOT NULL,
    "event" TEXT,
    "messageId" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Campaña WhatsApp',
    "status" "WhatsappCampaignStatus" NOT NULL DEFAULT 'draft',
    "blockId" INTEGER,
    "tags" TEXT,
    "requireAllTags" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 2500,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "total" INTEGER NOT NULL DEFAULT 0,
    "doneCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappCampaignItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" INTEGER,
    "to" TEXT NOT NULL,
    "name" TEXT,
    "tagsSnap" TEXT,
    "blockIdSnap" INTEGER,
    "status" "WhatsappCampaignItemStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappCampaignItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_whapiMessageId_key" ON "WhatsappMessage"("whapiMessageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_status_idx" ON "WhatsappMessage"("status");

-- CreateIndex
CREATE INDEX "WhatsappMessage_to_idx" ON "WhatsappMessage"("to");

-- CreateIndex
CREATE INDEX "WhatsappMessage_createdAt_idx" ON "WhatsappMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_campaignItemId_idx" ON "WhatsappMessage"("campaignItemId");

-- CreateIndex
CREATE INDEX "WhatsappWebhookLog_createdAt_idx" ON "WhatsappWebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsappWebhookLog_messageId_idx" ON "WhatsappWebhookLog"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappCampaign_status_idx" ON "WhatsappCampaign"("status");

-- CreateIndex
CREATE INDEX "WhatsappCampaign_createdAt_idx" ON "WhatsappCampaign"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappCampaignItem_messageId_key" ON "WhatsappCampaignItem"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappCampaignItem_campaignId_idx" ON "WhatsappCampaignItem"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsappCampaignItem_status_idx" ON "WhatsappCampaignItem"("status");

-- CreateIndex
CREATE INDEX "WhatsappCampaignItem_to_idx" ON "WhatsappCampaignItem"("to");

-- CreateIndex
CREATE INDEX "WhatsappCampaignItem_nextAttemptAt_idx" ON "WhatsappCampaignItem"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "Recipient_phone_idx" ON "Recipient"("phone");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "WhatsappCampaignItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappCampaignItem" ADD CONSTRAINT "WhatsappCampaignItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsappCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappCampaignItem" ADD CONSTRAINT "WhatsappCampaignItem_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappCampaignItem" ADD CONSTRAINT "WhatsappCampaignItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsappMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
