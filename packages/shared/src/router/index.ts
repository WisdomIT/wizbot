import { publicProcedure, t } from '../trpc';
import { adminRouter } from './admin';
import { chatbotRouter } from './chatbot';
import { commandRouter } from './command';
import { shortcutRouter } from './shortcut';
import { signupRouter } from './signup';
import { songRouter } from './song';
import { songFavoriteRouter } from './songFavorite';
import { userRouter } from './user';

export const appRouter = t.router({
  admin: adminRouter,
  chatbot: chatbotRouter,
  command: commandRouter,
  shortcut: shortcutRouter,
  signup: signupRouter,
  song: songRouter,
  songFavorite: songFavoriteRouter,
  user: userRouter,

  ping: publicProcedure.query(() => {
    return 'pong';
  }),
});

export type AppRouter = typeof appRouter;
