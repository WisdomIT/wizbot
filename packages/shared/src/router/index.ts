import { t } from '../trpc';
import { adminRouter } from './admin';
import { chatbotRouter } from './chatbot';
import { commandRouter } from './command';
import { songRouter } from './song';
import { userRouter } from './user';

export const appRouter = t.router({
  admin: adminRouter,
  chatbot: chatbotRouter,
  command: commandRouter,
  song: songRouter,
  user: userRouter,

  ping: t.procedure.query(() => {
    return 'pong';
  }),
});

export type AppRouter = typeof appRouter;
