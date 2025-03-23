import { t } from '../trpc';
import { songRouter } from './song';
import { userRouter } from './user';

export const appRouter = t.router({
  config: songRouter,
  user: userRouter,

  ping: t.procedure.query(() => {
    return 'pong';
  }),
});

export type AppRouter = typeof appRouter;
