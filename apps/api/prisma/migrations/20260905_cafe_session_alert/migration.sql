-- 봇 세션 만료 알림 발송 시각 (#9 PR4)
ALTER TABLE `NaverBotSession` ADD COLUMN `alertedAt` DATETIME(6) NULL;
