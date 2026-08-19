// ⚠ 수제 래퍼의 잔여분 — 챗봇 워커(apps/chatbot)가 세션 연결·채팅 전송에 아직 사용한다.
// #30 PR2(워커의 createRealtime 전환)에서 chat/session 과 함께 이 디렉터리 전체를 삭제한다.
// API 측(라우터·챗봇 함수)은 chzzk-open-sdk 를 사용한다 (services/chzzkClient.ts).
import * as chat from './chat';
import * as session from './session';

const chzzk = {
  session,
  chat,
};

export default chzzk;
