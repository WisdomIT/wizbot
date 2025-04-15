import chzzk from '@wizbot/shared/src/chzzk';
import io from 'socket.io-client';

const sessionURL = '#'; //chzzk.session.auth를 통해 발급받은 sessionURL

const socketOption = {
  reconnection: false,
  'force new connection': true,
  'connect timeout': 3000,
  transports: ['websocket'],
};

const socket = io.connect(sessionURL, socketOption);

// 연결 성공 시점 확인
socket.on('connect', () => {
  console.log('✅ Connected to socket server');

  // 이제 여기서부터 원하는 이벤트 리스너 등록
  socket.on('SYSTEM', (data) => {
    console.log('📡 SYSTEM EVENT:', data);
  });

  socket.on('CHAT', (data) => {
    console.log('💬 CHAT:', data);
  });

  socket.on('DONATION', (data) => {
    console.log('🎁 DONATION:', data);
  });
});

// 에러 처리
socket.on('connect_error', (err) => {
  console.error('❌ Connection error:', err);
});
