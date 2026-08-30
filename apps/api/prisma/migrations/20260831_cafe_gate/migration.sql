-- 카페 대문 HTML 가져오기·삽입 (#9 PR3)
ALTER TABLE `CafeIntegration`
    ADD COLUMN `gateHtml` MEDIUMTEXT NULL,
    ADD COLUMN `gateFetchedAt` DATETIME(6) NULL,
    ADD COLUMN `gateDraft` MEDIUMTEXT NULL,
    MODIFY `pendingAction` ENUM('VERIFY', 'FETCH_GATE', 'SAVE_GATE') NULL;
