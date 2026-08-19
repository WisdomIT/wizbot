/* eslint-disable no-console */

import dotenv from 'dotenv';
dotenv.config();

import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from '@wizbot/shared/src/router';
import express from 'express';

import { createContext } from './context';

const app = express();

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
