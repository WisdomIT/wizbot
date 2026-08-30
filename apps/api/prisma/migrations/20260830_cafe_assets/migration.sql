-- AlterTable
ALTER TABLE `CafeIntegration` ADD COLUMN `lastSaveSerial` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastSnapshot` JSON NULL;

-- CreateTable
CREATE TABLE `CafeAsset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `integrationId` INTEGER NOT NULL,
    `scene` VARCHAR(16) NOT NULL,
    `mimeType` VARCHAR(64) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `CafeAsset_integrationId_scene_key`(`integrationId`, `scene`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CafeAsset` ADD CONSTRAINT `CafeAsset_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `CafeIntegration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

