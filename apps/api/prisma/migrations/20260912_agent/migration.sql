-- 설정 도우미 에이전트 (#35)
ALTER TABLE `AuditLog` MODIFY `actorType` ENUM('STREAMER', 'ADMIN', 'CHATBOT', 'AGENT') NOT NULL;

CREATE TABLE `AgentSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `apiKey` VARCHAR(255) NOT NULL,
    `model` VARCHAR(64) NOT NULL DEFAULT 'claude-opus-5',
    `dailyTokenLimit` INTEGER NOT NULL DEFAULT 500000,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(6) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentConversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL DEFAULT '새 대화',
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updatedAt` DATETIME(6) NOT NULL,

    INDEX `AgentConversation_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `content` JSON NOT NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `AgentMessage_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentUsage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `conversationId` INTEGER NULL,
    `model` VARCHAR(64) NOT NULL,
    `inputTokens` INTEGER NOT NULL,
    `outputTokens` INTEGER NOT NULL,
    `cacheReadTokens` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `AgentUsage_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentConversation` ADD CONSTRAINT `AgentConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AgentMessage` ADD CONSTRAINT `AgentMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AgentConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AgentUsage` ADD CONSTRAINT `AgentUsage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
