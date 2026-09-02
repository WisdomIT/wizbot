-- 승인 카드·대화 soft delete (#35 조정 2·9, pelican tool_confirmation·#8 이식)
ALTER TABLE `AgentSettings` ADD COLUMN `allowConversationDelete` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `AgentConversation` ADD COLUMN `deletedAt` DATETIME(6) NULL;

CREATE TABLE `AgentPendingAction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `providerId` INTEGER NOT NULL,
    `toolUseId` VARCHAR(80) NOT NULL,
    `tool` VARCHAR(60) NOT NULL,
    `input` JSON NOT NULL,
    `card` JSON NOT NULL,
    `native` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `expiresAt` DATETIME(6) NOT NULL,
    `resolvedAt` DATETIME(6) NULL,

    INDEX `AgentPendingAction_conversationId_status_idx`(`conversationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentPendingAction` ADD CONSTRAINT `AgentPendingAction_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AgentConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
