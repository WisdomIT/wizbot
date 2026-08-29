-- 대문 렌더 스크린샷·요소 좌표 (#9 PR3 후속)
ALTER TABLE `CafeIntegration`
    ADD COLUMN `gateImage` LONGBLOB NULL,
    ADD COLUMN `gateBoxes` JSON NULL,
    ADD COLUMN `gateWidth` INTEGER NULL,
    ADD COLUMN `gateHeight` INTEGER NULL;
