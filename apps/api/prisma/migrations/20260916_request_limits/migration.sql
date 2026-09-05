-- 노래 신청 제한 설정 (#237) — 1인 1곡 boolean 을 개수 기반으로.
-- 기존 동작 보존: 켬 → 1곡, 꺼짐(무제한) → NULL. 신규 기본값은 1곡
ALTER TABLE `UserSetting` ADD COLUMN `songMaxPerRequester` INTEGER NULL DEFAULT 1;
UPDATE `UserSetting` SET `songMaxPerRequester` = NULL WHERE `songOneRequestPerUser` = false;
ALTER TABLE `UserSetting` DROP COLUMN `songOneRequestPerUser`;
