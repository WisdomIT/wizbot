-- AlterTable
ALTER TABLE `SongPlayback` ADD COLUMN `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `positionSeconds` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `startedAt` DATETIME(3) NULL,
    -- 기존 행이 있을 수 있으므로 기본값을 준다 (NOT NULL + no default 는 sql_mode 에 따라 0000-00-00 이 된다)
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `volume` INTEGER NOT NULL DEFAULT 70;

-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `songOverlayToken` VARCHAR(64) NULL,
    ADD COLUMN `songSourceToken` VARCHAR(64) NULL,
    ADD COLUMN `songSourceType` ENUM('NONE', 'OBS', 'ELECTRON') NOT NULL DEFAULT 'OBS';

