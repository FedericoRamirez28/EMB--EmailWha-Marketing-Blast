-- AlterTable
ALTER TABLE "WhatsappCampaign" ADD COLUMN     "autoRepliedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repliedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WhatsappCampaignItem" ADD COLUMN     "autoReplyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstReplyAt" TIMESTAMP(3),
ADD COLUMN     "lastAutoReplyAt" TIMESTAMP(3),
ADD COLUMN     "lastReplyAt" TIMESTAMP(3),
ADD COLUMN     "replyCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WhatsappInboundMessage" (
    "id" TEXT NOT NULL,
    "whapiMessageId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "chatId" TEXT,
    "type" TEXT,
    "body" TEXT,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaignId" TEXT,
    "campaignItemId" TEXT,

    CONSTRAINT "WhatsappInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInboundMessage_whapiMessageId_key" ON "WhatsappInboundMessage"("whapiMessageId");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_from_idx" ON "WhatsappInboundMessage"("from");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_createdAt_idx" ON "WhatsappInboundMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_campaignId_idx" ON "WhatsappInboundMessage"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_campaignItemId_idx" ON "WhatsappInboundMessage"("campaignItemId");

-- CreateIndex
CREATE INDEX "WhatsappCampaignItem_firstReplyAt_idx" ON "WhatsappCampaignItem"("firstReplyAt");

-- AddForeignKey
ALTER TABLE "WhatsappInboundMessage" ADD CONSTRAINT "WhatsappInboundMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsappCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInboundMessage" ADD CONSTRAINT "WhatsappInboundMessage_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "WhatsappCampaignItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
