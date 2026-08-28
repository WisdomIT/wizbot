-- CreateTable
CREATE TABLE `SignupApplication` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channelId` VARCHAR(32) NOT NULL,
    `channelName` VARCHAR(50) NOT NULL,
    `channelImageUrl` TEXT NULL,
    `reason` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `rejectReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updatedAt` DATETIME(6) NOT NULL,
    `processedAt` DATETIME(6) NULL,
    `processedById` INTEGER NULL,

    UNIQUE INDEX `SignupApplication_channelId_key`(`channelId`),
    INDEX `SignupApplication_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SignupApplication` ADD CONSTRAINT `SignupApplication_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

