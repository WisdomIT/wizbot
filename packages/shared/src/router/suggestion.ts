import { z } from 'zod';

import { suggestionService } from '../services';
import { streamerProcedure, t } from '../trpc';

const kindInput = z.enum(['UNUSED_COMMAND', 'MISSING_COMMAND', 'DISABLED_COMMAND', 'USAGE_ERROR_COMMAND', 'FAVORITE_SONG', 'AGENT_INTRO']);

/** 사용 패턴 기반 제안 (#276) — 목록은 하나로 내리고 각 화면이 자기 kind 만 고른다 */
export const suggestionRouter = t.router({
  list: streamerProcedure.query(({ ctx }) => suggestionService.listCommandSuggestions(ctx.prisma, ctx.user.id)),
  dismiss: streamerProcedure
    .input(z.object({ kind: kindInput, key: z.string().min(1).max(64) }))
    .mutation(({ ctx, input }) => suggestionService.dismiss(ctx.prisma, ctx.user.id, input.kind, input.key)),
});
