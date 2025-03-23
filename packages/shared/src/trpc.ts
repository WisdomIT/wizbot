import type { PrismaClient } from "@prisma/client";
import { initTRPC } from "@trpc/server";

import { appRouter } from "./router";

// 컨텍스트 타입 정의
export interface Context {
  prisma: PrismaClient;
}

// tRPC 인스턴스 생성
export const t = initTRPC.context<Context>().create();

export { appRouter };
