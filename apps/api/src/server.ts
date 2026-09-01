/* eslint-disable no-console */

import dotenv from 'dotenv';
dotenv.config();

import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from '@wizbot/shared/router';
import express from 'express';

import { agentChatHandler } from './agent/chat';
import { createContext } from './context';
import { songEventsHandler } from './song-events';

const app = express();

// 노래 재생 실시간 이벤트 (SSE) — tRPC 보다 먼저 등록한다
app.get('/song/events', (req, res) => {
  void songEventsHandler(req, res);
});

// 설정 도우미 에이전트 채팅 (SSE, #35)
app.post('/agent/chat', express.json(), (req, res) => {
  void agentChatHandler(req, res);
});

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

const port = Number(process.env.PORT ?? 3002);

app.listen(port, () => {
  console.log(`🚀 tRPC API 서버가 http://localhost:${port} 에서 실행 중!`);
});
