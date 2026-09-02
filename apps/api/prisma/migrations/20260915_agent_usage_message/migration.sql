-- 사용량 행을 턴의 마지막 어시스턴트 메시지에 연결 (#35 조정 — 로그 화면의 채팅별 토큰 표시)
ALTER TABLE `AgentUsage` ADD COLUMN `messageId` INTEGER NULL;
