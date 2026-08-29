-- 워커가 처리하던 JOIN 요청은 이제 없다 — 남아 있던 것은 운영자 대기(JOIN_REQUESTED)로 옮기고 enum 을 줄인다
UPDATE `CafeIntegration` SET `pendingAction` = NULL, `status` = 'JOIN_REQUESTED' WHERE `pendingAction` = 'JOIN';

-- AlterTable
ALTER TABLE `CafeIntegration` MODIFY `status` ENUM('NONE', 'JOIN_REQUESTED', 'JOINED', 'JOIN_FAILED', 'PERMISSION_OK', 'PERMISSION_FAILED', 'ACTIVE') NOT NULL DEFAULT 'NONE',
    MODIFY `pendingAction` ENUM('VERIFY') NULL;

