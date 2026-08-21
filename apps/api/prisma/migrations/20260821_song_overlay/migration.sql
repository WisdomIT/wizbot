-- 이전 마이그레이션이 기존 행 채우려고 넣었던 기본값 정리 (@updatedAt 은 앱에서 채운다)
-- AlterTable
ALTER TABLE `SongPlayback` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `songOverlayDurationSeconds` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `songOverlayMode` ENUM('ALWAYS', 'TIMED') NOT NULL DEFAULT 'ALWAYS';

