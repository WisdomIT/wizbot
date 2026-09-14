-- #297 가입 시각

-- AlterTable
ALTER TABLE `User` ADD COLUMN `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);


-- 백필: 기존 계정은 승인 시각(신청 기록)으로, 없으면 가장 오래된 로그인 접근 기록으로. 둘 다 없으면 마이그레이션 시각
UPDATE `User` u
  JOIN `SignupApplication` s ON s.`channelId` = u.`channelId`
  SET u.`createdAt` = s.`processedAt`
  WHERE s.`processedAt` IS NOT NULL;

UPDATE `User` u
  JOIN (
    SELECT `userId`, MIN(`createdAt`) AS `firstLogin`
    FROM `AuditLog`
    WHERE `procedure` = 'access.login' AND `userId` IS NOT NULL
    GROUP BY `userId`
  ) a ON a.`userId` = u.`id`
  SET u.`createdAt` = a.`firstLogin`
  WHERE a.`firstLogin` < u.`createdAt`;
