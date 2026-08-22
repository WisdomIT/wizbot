import { describe, expect, it } from 'vitest';

import { shouldReturnToPlayer } from '../config';

const SITE = 'https://bot.wisdomit.co.kr';

describe('shouldReturnToPlayer', () => {
  it('앱 화면에 있으면 그대로 둔다', () => {
    expect(shouldReturnToPlayer(`${SITE}/app/player`)).toBe(false);
    expect(shouldReturnToPlayer(`${SITE}/app/source`)).toBe(false);
  });

  it('로그인 화면은 건드리지 않는다', () => {
    expect(shouldReturnToPlayer(`${SITE}/login`)).toBe(false);
    expect(shouldReturnToPlayer(`${SITE}/login/auth?code=x&state=y`)).toBe(false);
  });

  it('로그인을 마치고 콘솔로 보내려 하면 되돌린다', () => {
    // 웹의 auth 라우트가 /login/redirect?to=/streamer 로 보낸다
    expect(shouldReturnToPlayer(`${SITE}/login/redirect?to=/streamer`)).toBe(true);
    // 앱 화면으로 보내는 경우는 그대로 둔다
    expect(shouldReturnToPlayer(`${SITE}/login/redirect?to=/app/player`)).toBe(false);
  });

  it('콘솔·랜딩 등 다른 화면에 도착하면 되돌린다', () => {
    expect(shouldReturnToPlayer(`${SITE}/streamer`)).toBe(true);
    expect(shouldReturnToPlayer(`${SITE}/streamer/song/favorite`)).toBe(true);
    expect(shouldReturnToPlayer(SITE)).toBe(true);
  });

  it('외부 도메인은 건드리지 않는다 (치지직 로그인 등)', () => {
    expect(shouldReturnToPlayer('https://chzzk.naver.com/account-interlock')).toBe(false);
    expect(shouldReturnToPlayer('https://nid.naver.com/oauth2/authorize')).toBe(false);
  });
});
