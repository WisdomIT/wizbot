-- CreateTable
CREATE TABLE `UserTheme` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `primaryColor` VARCHAR(7) NULL,
    `backgroundColor` VARCHAR(7) NULL,
    `colorScheme` ENUM('SYSTEM', 'LIGHT', 'DARK') NOT NULL DEFAULT 'SYSTEM',
    `fontKey` VARCHAR(32) NOT NULL DEFAULT 'suit',
    `updatedAt` DATETIME(6) NOT NULL,

    UNIQUE INDEX `UserTheme_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserTheme` ADD CONSTRAINT `UserTheme_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

