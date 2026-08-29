-- DropForeignKey
ALTER TABLE `CafeChzzk` DROP FOREIGN KEY `CafeChzzk_userId_fkey`;

-- DropForeignKey
ALTER TABLE `CafeYoutube` DROP FOREIGN KEY `CafeYoutube_userId_fkey`;

-- DropTable
DROP TABLE `CafeChzzk`;

-- DropTable
DROP TABLE `CafeYoutube`;

-- CreateTable
CREATE TABLE `NaverBotSession` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `displayName` VARCHAR(50) NOT NULL,
    `nidAut` TEXT NOT NULL,
    `nidSes` TEXT NOT NULL,
    `updatedAt` DATETIME(6) NOT NULL,
    `checkedAt` DATETIME(6) NULL,
    `valid` BOOLEAN NULL,
    `checkMessage` VARCHAR(500) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CafeIntegration` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `cafeUrl` VARCHAR(200) NULL,
    `clubId` VARCHAR(32) NULL,
    `cafeName` VARCHAR(100) NULL,
    `status` ENUM('NONE', 'JOIN_REQUESTED', 'JOIN_FAILED', 'PERMISSION_OK', 'PERMISSION_FAILED', 'ACTIVE') NOT NULL DEFAULT 'NONE',
    `statusMessage` VARCHAR(500) NULL,
    `pendingAction` ENUM('JOIN', 'VERIFY') NULL,
    `requestedAt` DATETIME(6) NULL,
    `youtubeChannelId` VARCHAR(24) NULL,
    `youtubeWidth` INTEGER NOT NULL DEFAULT 560,
    `youtubeHeight` INTEGER NOT NULL DEFAULT 315,
    `layout` JSON NULL,
    `updatedAt` DATETIME(6) NOT NULL,

    UNIQUE INDEX `CafeIntegration_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CafeIntegration` ADD CONSTRAINT `CafeIntegration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

