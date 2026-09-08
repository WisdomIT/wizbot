-- 접근 기록 (#254) — 어드민 로그인처럼 대상 스트리머가 없는 기록을 같은 테이블에 남긴다
-- AlterTable
ALTER TABLE `AuditLog` MODIFY `userId` INTEGER NULL;
