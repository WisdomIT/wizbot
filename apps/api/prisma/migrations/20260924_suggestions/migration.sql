-- #276 제안 숨김 기록 + 명령어 생성 시각

-- AlterTable
ALTER TABLE `ChatbotEchoCommand` ADD COLUMN `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

-- AlterTable
ALTER TABLE `ChatbotFunctionCommand` ADD COLUMN `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

-- CreateTable
CREATE TABLE `UserSuggestionDismissal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `kind` ENUM('UNUSED_COMMAND', 'MISSING_COMMAND', 'DISABLED_COMMAND', 'USAGE_ERROR_COMMAND', 'FAVORITE_SONG', 'AGENT_INTRO') NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `dismissedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `UserSuggestionDismissal_userId_kind_key_key`(`userId`, `kind`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSuggestionDismissal` ADD CONSTRAINT `UserSuggestionDismissal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

