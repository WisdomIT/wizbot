import { publicProcedure, t } from '../trpc';
import { adminRouter } from './admin';
import { auditRouter } from './audit';
import { cafeRouter } from './cafe';
import { chatbotRouter } from './chatbot';
import { commandRouter } from './command';
import { inquiryRouter } from './inquiry';
import { noticeRouter } from './notice';
import { notifyRouter } from './notify';
import { shortcutRouter } from './shortcut';
import { signupRouter } from './signup';
import { songRouter } from './song';
import { songFavoriteRouter } from './songFavorite';
import { userRouter } from './user';

export const appRouter = t.router({
  audit: auditRouter,
  notice: noticeRouter,
  inquiry: inquiryRouter,
  notify: notifyRouter,
  admin: adminRouter,
  cafe: cafeRouter,
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
