-- 운영 알림용 디스코드 웹훅 (#207)
CREATE TABLE `DiscordWebhook` (
    `kind` ENUM('SESSION_EXPIRED', 'SIGNUP', 'CAFE_JOIN', 'INQUIRY', 'ERROR') NOT NULL,
    `url` VARCHAR(300) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(6) NOT NULL,

    PRIMARY KEY (`kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
