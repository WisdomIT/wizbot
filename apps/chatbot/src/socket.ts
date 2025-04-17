import io from 'socket.io-client';
import { ChatStatus } from './index.d';
import chzzk from '@wizbot/shared/src/chzzk';
import { trpc } from './trpc';
import {
  ChzzkSessionsMessageSystem,
  ChzzkSessionsMessageChat,
  ChzzkSessionsMessageDonation,
} from '@wizbot/shared/src/chzzk/index.d';

const socketOption = {
  reconnection: false,
  'force new connection': true,
  'connect timeout': 3000,
  transports: ['websocket'],
};

export default function connectSocket(data: ChatStatus, onDisconnect: () => void) {
  const { userId, channelId, sessionURL } = data;

  if (!sessionURL) {
    console.error('❌ sessionURL이 null이거나 정의되지 않았습니다.');
    return;
  }

  const socket = io.connect(sessionURL, socketOption);

  // 연결 성공 시점 확인
  socket.on('connect', () => {
    console.log('✅ Socket 연결됨:', channelId);

    // 이제 여기서부터 원하는 이벤트 리스너 등록
    socket.on('SYSTEM', async (data) => {
      const parsedData = JSON.parse(data) as ChzzkSessionsMessageSystem;

      switch (parsedData.type) {
        case 'connected':
          console.log('🔌 연결됨:', channelId);

          const sessionKey = parsedData.data.sessionKey;
          const token = await trpc.user.getAccessToken.query({ userId });
          setTimeout(async () => {
            const chat = await chzzk.session.eventsSubscribeChat(token.accessToken, { sessionKey });
            const donation = await chzzk.session.eventsSubscribeDonation(token.accessToken, {
              sessionKey,
            });
            console.log(chat, donation);
          }, 1000); // 1초 대기 후 이벤트 구독 요청

          break;
        case 'revoked':
          console.log('🔒 권한 해제됨:', channelId);
        case 'subscribed':
          console.log('🔔 이벤트 구독됨:', channelId, parsedData.data.eventType);
          break;
        default:
          console.log('📡 시스템 이벤트:', parsedData);
      }
    });

    socket.on('CHAT', (data) => {
      const parsedData = JSON.parse(data) as ChzzkSessionsMessageChat;
      console.log('💬 CHAT:', data);
    });

    socket.on('DONATION', (data) => {
      const parsedData = JSON.parse(data) as ChzzkSessionsMessageDonation;
      console.log('🎁 DONATION:', data);
    });
  });

  // 에러 처리
  socket.on('connect_error', (err) => {
    console.error('❌ Connection error:', err);
    onDisconnect();
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket 연결 해제됨:', reason);
    onDisconnect();
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
    onDisconnect();
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('🔄 재연결 시도:', attempt);
  });

  socket.on('reconnect', (attempt) => {
    console.log('🔄 재연결 성공:', attempt);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ 재연결 실패');
    onDisconnect();
  });

  socket.on('reconnect_error', (error) => {
    console.error('❌ 재연결 에러:', error);
    onDisconnect();
  });
}
