-- #318 카페 대문 읽기 검증·연속 판정·자동 재불러오기·이벤트 기록

-- AlterTable
ALTER TABLE `CafeIntegration` ADD COLUMN `autoRefetchCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `missingStreak` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `nextRefetchAt` DATETIME(6) NULL;

-- CreateTable
CREATE TABLE `CafeIntegrationEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `integrationId` INTEGER NOT NULL,
    `kind` ENUM('MISSING', 'STOPPED', 'SUSPICIOUS_READ', 'STALE', 'AUTO_REFETCH', 'RECOVERED', 'GAVE_UP', 'SAVE_FAILED') NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `htmlLength` INTEGER NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `CafeIntegrationEvent_integrationId_createdAt_idx`(`integrationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CafeIntegrationEvent` ADD CONSTRAINT `CafeIntegrationEvent_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `CafeIntegration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

