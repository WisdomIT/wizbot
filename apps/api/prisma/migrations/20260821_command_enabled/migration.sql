-- AlterTable
ALTER TABLE `ChatbotEchoCommand` ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `ChatbotFunctionCommand` ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `ChatbotRepeat` ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true;

