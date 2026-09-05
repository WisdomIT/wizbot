-- 서비스 이용약관·개인정보처리방침 (#252)
-- CreateTable
CREATE TABLE `PolicyDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('TERMS', 'PRIVACY') NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `publishedAt` DATETIME(6) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updatedAt` DATETIME(6) NOT NULL,

    INDEX `PolicyDocument_type_publishedAt_idx`(`type`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
