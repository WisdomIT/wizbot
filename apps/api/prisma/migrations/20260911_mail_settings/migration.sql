-- SMTP 설정을 DB 로 (#215)
CREATE TABLE `MailSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `host` VARCHAR(255) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 465,
    `user` VARCHAR(255) NOT NULL,
    `pass` VARCHAR(255) NOT NULL,
    `sender` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(6) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
