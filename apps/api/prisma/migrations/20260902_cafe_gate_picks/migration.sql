-- 대문 자리 선택 저장·유튜브 채널 주소 해석 (#9)
ALTER TABLE `CafeIntegration`
    DROP COLUMN `gateDraft`,
    DROP COLUMN `youtubeWidth`,
    DROP COLUMN `youtubeHeight`,
    ADD COLUMN `youtubeTitle` VARCHAR(100) NULL,
    ADD COLUMN `youtubeUrl` VARCHAR(200) NULL,
    ADD COLUMN `gatePicks` JSON NULL;
