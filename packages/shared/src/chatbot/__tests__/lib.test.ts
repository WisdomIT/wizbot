import { describe, expect, it } from 'vitest';

import { CHAT_MAX_LENGTH, clampChatMessage, fitChatMessage, formatDuration, splitContent } from '../lib';

describe('splitContent', () => {
  it('명령어 뒤 인수를 slice 개수만큼 나누고 마지막 조각에 나머지를 합친다', () => {
    expect(splitContent('!추가 카페 https://cafe.naver.com/x', '추가', 2)).toEqual([
      '카페',
      'https://cafe.naver.com/x',
    ]);
    expect(splitContent('!추가 인사 안녕하세요 반갑습니다', '추가', 2)).toEqual([
      '인사',
      '안녕하세요 반갑습니다',
    ]);
  });

  it('slice가 1이면 나머지 전체를 하나로 반환한다', () => {
    expect(splitContent('!방제 수정 오늘은 저챗', '방제 수정', 1)).toEqual(['오늘은 저챗']);
  });

  it('연속 공백은 하나의 구분자로 처리한다', () => {
    expect(splitContent('!추가   카페   응답   값', '추가', 2)).toEqual(['카페', '응답 값']);
  });

  it('인수가 없으면 빈 문자열 조각을 반환한다', () => {
    expect(splitContent('!추가', '추가', 2)).toEqual(['']);
    expect(splitContent('!방제', '방제', 1)).toEqual(['']);
  });

  it("'!'로 시작하지 않으면 예외", () => {
    expect(() => splitContent('추가 a b', '추가', 2)).toThrow();
  });

  it('command가 content와 매칭되지 않으면 예외', () => {
    expect(() => splitContent('!삭제 a', '추가', 1)).toThrow();
  });
});

describe('formatDuration', () => {
  it('1시간 미만은 분/초만 표시한다', () => {
    expect(formatDuration(0)).toBe('00분 00초');
    expect(formatDuration(61_000)).toBe('01분 01초');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59분 59초');
  });

  it('1시간 이상은 시간까지 표시한다', () => {
    expect(formatDuration(3_661_000)).toBe('01시간 01분 01초');
    expect(formatDuration(25 * 3_600_000)).toBe('25시간 00분 00초');
  });

  it('음수는 절대값으로 처리한다', () => {
    expect(formatDuration(-61_000)).toBe('01분 01초');
  });
});

describe('fitChatMessage', () => {
  it('한도 안이면 그대로 둔다', () => {
    expect(fitChatMessage('♪ ', 'LUCY - 개화', ' | !노래 목록')).toBe('♪ LUCY - 개화 | !노래 목록');
  });

  it('본문이 길면 말줄임하되 접미사는 지킨다', () => {
    const tail = ' | !노래 목록';
    const result = fitChatMessage('♪ ', '가'.repeat(200), tail);

    expect(result.length).toBe(CHAT_MAX_LENGTH);
    // 링크·안내가 잘리면 쓸모가 없어진다
    expect(result.endsWith(tail)).toBe(true);
    expect(result).toContain('…');
  });

  it('접미사만으로 한도를 넘으면 전체를 자른다', () => {
    const result = fitChatMessage('', '본문', '나'.repeat(200));
    expect(result.length).toBe(CHAT_MAX_LENGTH);
  });
});

describe('clampChatMessage', () => {
  it('한도를 넘는 메시지를 자른다', () => {
    expect(clampChatMessage('가'.repeat(150))).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('한도 안이면 건드리지 않는다', () => {
    expect(clampChatMessage('짧은 메시지')).toBe('짧은 메시지');
  });
});
