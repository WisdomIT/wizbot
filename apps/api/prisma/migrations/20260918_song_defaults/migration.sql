-- 노래 기본값 변경 (#246) — 기존 사용자 설정은 그대로 두고 새 계정에만 적용된다
-- AlterTable
ALTER TABLE `UserSetting` MODIFY `songOverlayDurationSeconds` INTEGER NOT NULL DEFAULT 15,
    MODIFY `songOverlayMode` ENUM('ALWAYS', 'TIMED') NOT NULL DEFAULT 'TIMED',
    MODIFY `songAutoPlayFromDefault` BOOLEAN NOT NULL DEFAULT true;

-- 기본 즐겨찾기 「위즈 추천 플레이리스트」의 출처 재생목록 (#246) — 어드민 페이지에서 변경 가능
INSERT INTO `SiteSetting` (`key`, `value`, `updatedAt`)
VALUES ('defaultPlaylistUrl', 'https://www.youtube.com/playlist?list=PL8p4UdiudDtY_XxIsTZzlY0p5qYLPq6xI', NOW(3))
ON DUPLICATE KEY UPDATE `key` = `key`;
