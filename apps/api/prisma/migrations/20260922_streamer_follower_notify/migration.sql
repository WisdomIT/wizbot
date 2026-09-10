-- #271 신규 스트리머 등록 알림 종류 + 팔로워 수 스냅샷

-- AlterTable
ALTER TABLE `DiscordWebhook` DROP PRIMARY KEY,
    MODIFY `kind` ENUM('SESSION_EXPIRED', 'SIGNUP', 'CAFE_JOIN', 'INQUIRY', 'ERROR', 'STREAMER_JOINED') NOT NULL,
    ADD PRIMARY KEY (`kind`);

-- AlterTable
ALTER TABLE `User` ADD COLUMN `followerCount` INTEGER NULL;
