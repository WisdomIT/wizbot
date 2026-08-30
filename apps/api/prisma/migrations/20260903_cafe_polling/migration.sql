-- 대문 갱신 정책 상태 (#9 PR3b)
ALTER TABLE `CafeIntegration`
    ADD COLUMN `lastSavedAt` DATETIME(6) NULL,
    ADD COLUMN `lastViewerBucket` INTEGER NULL,
    ADD COLUMN `gateSerial` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `saveAttemptedAt` DATETIME(6) NULL;
