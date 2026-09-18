-- #319 플레이어 연속 실패 차단기·실패 원인

-- AlterTable
ALTER TABLE `SongHistory` ADD COLUMN `failReason` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `SongPlayback` ADD COLUMN `failStreak` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastFailReason` VARCHAR(60) NULL;

