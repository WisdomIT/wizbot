-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `songOverlayDurationSeconds` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `songOverlayMode` ENUM('ALWAYS', 'TIMED') NOT NULL DEFAULT 'ALWAYS';
