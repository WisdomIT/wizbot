import type { Prisma, PrismaClient } from '@prisma/client';
import type { ChzzkTokenSet } from 'chzzk-open-sdk';

import { getChzzkClientForUser } from './chzzkClient';

export type StreamerIdentity = {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
};

export type InitialCommands = (userId: number) => {
  initialFunction: Prisma.ChatbotFunctionCommandCreateManyInput[];
  initialEcho: Prisma.ChatbotEchoCommandCreateManyInput[];
};

/**
 * 스트리머 계정 프로비저닝 — 로그인 인터락과 신청 승인(#151)이 공유한다.
 * User·UserSetting 을 보장하고, 토큰이 있으면 OAuthCredential 에 넣고, 명령어가 하나도 없으면
 * 기본 명령어를 만든다. 멱등이다 — 이미 있는 것은 건드리지 않는다.
 *
 * 기본 명령어 생성기는 인자로 받는다. chatbot 모듈이 services 를 임포트하므로 여기서 chatbot 을
 * 임포트하면 순환이 된다.
 */
export async function provisionStreamer(
  prisma: PrismaClient,
  identity: StreamerIdentity,
  options: { tokens?: ChzzkTokenSet | null; initialCommands: InitialCommands },
) {
  const user = await prisma.user.upsert({
    where: { channelId: identity.channelId },
    update: { channelName: identity.channelName, channelImageUrl: identity.channelImageUrl },
    create: identity,
  });

  const setting = await prisma.userSetting.findFirst({ where: { userId: user.id } });
  if (!setting) await prisma.userSetting.create({ data: { userId: user.id } });

  if (options.tokens) {
    await getChzzkClientForUser(prisma, user.id).auth.setTokens(options.tokens);
  }

  const hasCommand = await prisma.chatbotFunctionCommand.findFirst({ where: { userId: user.id } });
  if (!hasCommand) {
    const { initialFunction, initialEcho } = options.initialCommands(user.id);
    await prisma.chatbotFunctionCommand.createMany({ data: initialFunction });
    await prisma.chatbotEchoCommand.createMany({ data: initialEcho });
  }

  return user;
}
