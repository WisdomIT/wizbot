-- #322 송출 소스를 세션 선택으로 — 선택된 세션 ID·이름, 재생 요청/응답 시각

-- AlterTable
ALTER TABLE `UserSetting` ADD COLUMN `songSourceLabel` VARCHAR(80) NULL,
    ADD COLUMN `songSourceSessionId` VARCHAR(64) NULL,
    MODIFY `songSourceType` ENUM('NONE', 'OBS', 'ELECTRON') NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE `SongPlayback` ADD COLUMN `playRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `sourceAckAt` DATETIME(3) NULL;

