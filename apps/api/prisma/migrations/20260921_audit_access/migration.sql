-- 접근 기록 (#254) — 어드민 로그인처럼 대상 스트리머가 없는 기록을 같은 테이블에 남기고,
-- 스트리머가 탈퇴해도 접근 기록은 지워지지 않게 한다 (userId 만 비운다; 식별자는 input 에 남아 있다)
-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_userId_fkey`;

-- AlterTable
ALTER TABLE `AuditLog` MODIFY `userId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
