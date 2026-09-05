import { publicProcedure, t } from '../trpc';
import { adminRouter } from './admin';
import { agentRouter } from './agent';
import { auditRouter } from './audit';
import { cafeRouter } from './cafe';
import { chatbotRouter } from './chatbot';
import { commandRouter } from './command';
import { inquiryRouter } from './inquiry';
import { noticeRouter } from './notice';
import { notifyRouter } from './notify';
import { policyRouter } from './policy';
import { shortcutRouter } from './shortcut';
import { signupRouter } from './signup';
import { songRouter } from './song';
import { songFavoriteRouter } from './songFavorite';
import { userRouter } from './user';

export const appRouter = t.router({
  audit: auditRouter,
  agent: agentRouter,
  notice: noticeRouter,
  inquiry: inquiryRouter,
  notify: notifyRouter,
  policy: policyRouter,
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

//  에이전트(#35)가 tool 로 문의를 만들 때 같은 운영자 알림을 쓴다
export { notifyAdminsOfInquiry } from './inquiry';
