-- 에이전트 프로바이더 목록·한도 규칙 (#35, pelican-concierge #89·#4 방식)
CREATE TABLE `AgentProvider` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `priority` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `kind` ENUM('ANTHROPIC', 'OPENAI', 'GEMINI', 'OPENAI_COMPAT') NOT NULL,
    `apiKey` VARCHAR(255) NOT NULL DEFAULT '',
    `baseUrl` VARCHAR(255) NULL,
    `model` VARCHAR(100) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updatedAt` DATETIME(6) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentLimit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `metric` ENUM('TOKENS', 'MESSAGES') NOT NULL,
    `scope` ENUM('STREAMER', 'GLOBAL') NOT NULL,
    `period` ENUM('HOUR', 'DAY', 'WEEK', 'MONTH') NOT NULL,
    `amount` INTEGER NOT NULL,
    `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 기존 설정 이관: 키 → 1순위 Anthropic 항목, 일일 토큰 한도 → 동등 규칙(스트리머·일·토큰)
INSERT INTO `AgentProvider` (`priority`, `name`, `kind`, `apiKey`, `model`, `enabled`, `updatedAt`)
SELECT 1, 'Anthropic', 'ANTHROPIC', `apiKey`, `model`, true, NOW(6)
FROM `AgentSettings` WHERE `id` = 1 AND `apiKey` <> '';

INSERT INTO `AgentLimit` (`metric`, `scope`, `period`, `amount`)
SELECT 'TOKENS', 'STREAMER', 'DAY', `dailyTokenLimit`
FROM `AgentSettings` WHERE `id` = 1;

ALTER TABLE `AgentSettings`
    DROP COLUMN `apiKey`,
    DROP COLUMN `model`,
    DROP COLUMN `dailyTokenLimit`,
    ADD COLUMN `webSearchEnabled` BOOLEAN NOT NULL DEFAULT false;

-- 사용량 귀속 (어느 항목으로 청구됐는가) + 전체(GLOBAL) 한도 조회용 인덱스
ALTER TABLE `AgentUsage`
    ADD COLUMN `provider` VARCHAR(20) NOT NULL DEFAULT 'ANTHROPIC',
    ADD COLUMN `entryName` VARCHAR(60) NULL,
    MODIFY `model` VARCHAR(100) NOT NULL;

CREATE INDEX `AgentUsage_createdAt_idx` ON `AgentUsage`(`createdAt`);
