import { describe, expect, it } from 'vitest';

import { formatDuration, splitContent } from '../lib';

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
