-- AlterTable
ALTER TABLE `SongFavorite` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `SongFavoriteItem` ADD COLUMN `durationSeconds` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `UserSetting` DROP COLUMN `songFavoriteAuto`;

-- CreateIndex
CREATE INDEX `SongFavorite_userId_createdAt_idx` ON `SongFavorite`(`userId`, `createdAt`);

-- CreateIndex
CREATE INDEX `SongFavoriteItem_favoriteId_order_idx` ON `SongFavoriteItem`(`favoriteId`, `order`);

