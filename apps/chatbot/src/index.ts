/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import chzzk from '@wizbot/shared/src/chzzk';

import { ChatStatus } from './index.d';
import connectSocket, { updateRepeats } from './socket';
import { trpc } from './trpc';

if (!process.env.INTERNAL_API_TOKEN) {
  console.error('❌ INTERNAL_API_TOKEN 환경변수가 없습니다. apps/chatbot/.env 를 확인하세요.');
  process.exit(1);
}

console.log('🚀 Chatbot 서버가 실행되었습니다!');

const status: ChatStatus[] = [];

async function getStatusInterval() {
  let statusRequest;
  let botChannelId;

  try {
    statusRequest = await trpc.chatbot.getChannels.query();
    botChannelId = await trpc.chatbot.getChatbotChannelId.query();
  } catch (error) {
    console.error('❌ statusRequest를 가져오는 데 실패했습니다:', error);
    return;
  }

  if (!statusRequest || !botChannelId) {
    console.error('❌ statusRequest 또는 botChannelId를 가져오는 데 실패했습니다.');
    return;
  }

  for (const channel of statusRequest) {
    let thisStatus = status.find((s) => s.channelId === channel.channelId);
    let token;
    try {
      token = await trpc.user.ensureAccessToken.mutate({ userId: channel.id });
    } catch (error) {
      console.error('❌ 토큰을 가져오는 데 실패했습니다:', channel.channelName);
    }

    // sessionURL이 null이거나 thisStatus가 없으면 세션 URL을 가져옴
    if (!thisStatus?.sessionURL && token) {
      try {
        const sessionURL = await chzzk.session.auth(token.accessToken);

        if (sessionURL.code !== 200) {
          console.error('❌ 세션 URL을 가져오는 데 실패했습니다:', sessionURL.message);
          continue;
        }

        // thisStatus가 없으면 status에 추가
        // thisStatus가 있으면 sessionURL을 업데이트
        if (!thisStatus) {
          const tempStatus: ChatStatus = {
            userId: channel.id,
            channelId: channel.channelId,
            channelName: channel.channelName,
            sessionURL: sessionURL.content.url,
            botChannelId,
          };

          status.push(tempStatus);

          thisStatus = status.find((s) => s.channelId === channel.channelId);
          if (!thisStatus) {
            console.error('❌ thisStatus를 찾을 수 없습니다:', channel.channelId);
            continue;
          }
        } else {
          thisStatus.sessionURL = sessionURL.content.url;
        }

        // 소켓 연결
        connectSocket(thisStatus, () => {
          if (!thisStatus) {
            console.error('❌ thisStatus를 찾을 수 없습니다 (연결해제):', channel.channelId);
            return;
          }
          thisStatus.sessionURL = null; // 연결 실패 혹은 해제 시 sessionURL을 null로 설정
        });
      } catch (error) {
        console.error(`❌ 에러가 발생했습니다: ${channel.channelName}`, error);
        continue;
      }
    }
  }
}

setInterval(() => {
  void getStatusInterval();
}, 1000 * 60);

setTimeout(() => {
  void getStatusInterval();
}, 1000);

function updateRepeatsInterval() {
  for (const s of status) {
    if (s.sessionURL) {
      void updateRepeats(s.userId);
    }
  }
}

setInterval(() => {
  void updateRepeatsInterval();
}, 60 * 1000);

setTimeout(() => {
  void updateRepeatsInterval();
}, 5000);
