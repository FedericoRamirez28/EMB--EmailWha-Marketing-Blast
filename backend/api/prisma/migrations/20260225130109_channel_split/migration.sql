/*
  Warnings:

  - The primary key for the `Block` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[channel,email]` on the table `Recipient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[channel,phone]` on the table `Recipient` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BlockChannel" AS ENUM ('whatsapp', 'email');

-- CreateEnum
CREATE TYPE "RecipientChannel" AS ENUM ('whatsapp', 'email');

-- DropIndex
DROP INDEX "Recipient_blockId_idx";

-- DropIndex
DROP INDEX "Recipient_email_key";

-- AlterTable
ALTER TABLE "Block" DROP CONSTRAINT "Block_pkey",
ADD COLUMN     "channel" "BlockChannel" NOT NULL DEFAULT 'whatsapp',
ADD CONSTRAINT "Block_pkey" PRIMARY KEY ("channel", "id");

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "channel" "RecipientChannel" NOT NULL DEFAULT 'email',
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "phone" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Block_channel_idx" ON "Block"("channel");

-- CreateIndex
CREATE INDEX "Recipient_channel_idx" ON "Recipient"("channel");

-- CreateIndex
CREATE INDEX "Recipient_channel_blockId_idx" ON "Recipient"("channel", "blockId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_channel_email_key" ON "Recipient"("channel", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_channel_phone_key" ON "Recipient"("channel", "phone");
