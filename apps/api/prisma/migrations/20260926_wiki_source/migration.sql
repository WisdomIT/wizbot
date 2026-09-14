-- #309 위키 소스·페이지

-- CreateTable
CREATE TABLE `WikiSource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(60) NOT NULL,
    `baseUrl` VARCHAR(200) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `endsAt` DATETIME(6) NULL,
    `maxPages` INTEGER NOT NULL DEFAULT 150,
    `viewerCooldownMinutes` INTEGER NOT NULL DEFAULT 30,
    `perChannelDaily` INTEGER NOT NULL DEFAULT 200,
    `globalDaily` INTEGER NOT NULL DEFAULT 2000,
    `lastCrawledAt` DATETIME(6) NULL,
    `lastError` VARCHAR(500) NULL,
    `consecutiveFailures` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updatedAt` DATETIME(6) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WikiPage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sourceId` INTEGER NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `fetchedAt` DATETIME(6) NOT NULL,
    `changedAt` DATETIME(6) NOT NULL,

    UNIQUE INDEX `WikiPage_sourceId_url_key`(`sourceId`, `url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WikiPage` ADD CONSTRAINT `WikiPage_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `WikiSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

