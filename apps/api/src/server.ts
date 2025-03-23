/* eslint-disable no-console */

import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from '@wizbot/shared/src/router';
import express from 'express';

import { prisma } from './db';

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: () => ({ prisma }),
  }),
);

app.listen(3002, () => {
  console.log('🚀 tRPC API 서버가 http://localhost:3002 에서 실행 중!');
});
