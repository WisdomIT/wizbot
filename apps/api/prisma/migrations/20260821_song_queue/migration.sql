-- AlterTable
-- prisma migrate diff 가 함께 emit 한 정렬용 구문. 0_init 도 DATETIME 이라 타입 변화는 없다
-- (제거하면 이후 diff 에서 다시 나오므로 그대로 둔다)
ALTER TABLE `OAuthCredential` MODIFY `expiresIn` DATETIME NOT NULL;

-- AlterTable
ALTER TABLE `Song` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `requesterChannelId` VARCHAR(32) NULL,
    ADD COLUMN `thumbnailUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `SongFavorite` ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `songAutoPlayFromDefault` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `songHistoryPublic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `songMaxDurationSeconds` INTEGER NOT NULL DEFAULT 600,
    ADD COLUMN `songMaxQueueLength` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `songOneRequestPerUser` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `SongHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `youtubeId` VARCHAR(11) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `videoUploader` VARCHAR(150) NOT NULL,
    `requester` VARCHAR(40) NOT NULL,
    `requesterChannelId` VARCHAR(32) NULL,
    `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PLAYED', 'SKIPPED', 'CANCELED', 'FAILED') NOT NULL,
    `resolvedBy` VARCHAR(40) NULL,
    `hiddenFromViewers` BOOLEAN NOT NULL DEFAULT false,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `SongHistory_userId_requestedAt_idx`(`userId`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteSetting` (
    `key` VARCHAR(50) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Song_userId_order_idx` ON `Song`(`userId`, `order`);

-- AddForeignKey
ALTER TABLE `SongHistory` ADD CONSTRAINT `SongHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

