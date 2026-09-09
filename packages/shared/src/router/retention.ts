import { retentionService } from '../services';
import { internalProcedure, t } from '../trpc';

/** 보관 기간 경과 데이터 파기 (#255) — 챗봇 워커 폴링이 하루 1회 부른다 (signup.refreshPendingTokens 와 같은 패턴) */
export const retentionRouter = t.router({
  purgeExpired: internalProcedure.mutation(({ ctx }) => retentionService.purgeExpired(ctx.prisma)),
});
