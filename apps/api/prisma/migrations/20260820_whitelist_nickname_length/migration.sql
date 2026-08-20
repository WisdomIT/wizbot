-- Whitelist.nickname 을 치지직 채널명 길이에 맞게 확장 (#10 — 추가 시 채널명 자동 저장)
ALTER TABLE `Whitelist` MODIFY `nickname` VARCHAR(50) NOT NULL;
