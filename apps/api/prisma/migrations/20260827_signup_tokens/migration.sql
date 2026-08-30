-- AlterTable
ALTER TABLE `SignupApplication` ADD COLUMN `accessToken` TEXT NULL,
    ADD COLUMN `acknowledgedAt` DATETIME(6) NULL,
    ADD COLUMN `refreshToken` TEXT NULL,
    ADD COLUMN `tokenExpiresAt` DATETIME(0) NULL,
    ADD COLUMN `tokenRefreshedAt` DATETIME(0) NULL,
    ADD COLUMN `tokenType` VARCHAR(20) NULL;

