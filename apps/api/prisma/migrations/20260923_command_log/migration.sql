-- #276 명령어 호출 로그 + 누적 호출 수

-- AlterTable
ALTER TABLE `ChatbotEchoCommand` ADD COLUMN `totalCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ChatbotFunctionCommand` ADD COLUMN `totalCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ChatbotCommandLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `command` VARCHAR(40) NOT NULL,
    `matchedType` ENUM('ECHO', 'FUNCTION', 'NONE') NOT NULL,
    `matchedId` INTEGER NULL,
    `outcome` ENUM('OK', 'NOT_FOUND', 'USAGE_ERROR', 'NO_PERMISSION', 'ERROR') NOT NULL,
    `senderChannelId` VARCHAR(32) NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `ChatbotCommandLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `ChatbotCommandLog_userId_command_createdAt_idx`(`userId`, `command`, `createdAt`),
    INDEX `ChatbotCommandLog_userId_matchedType_matchedId_createdAt_idx`(`userId`, `matchedType`, `matchedId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatbotCommandLog` ADD CONSTRAINT `ChatbotCommandLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

