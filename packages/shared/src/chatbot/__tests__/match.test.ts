import { describe, expect, it } from 'vitest';

import { findExactCommandMatch } from '..';

const commands = [
  { command: '방제' },
  { command: '방제 수정' },
  { command: '카페' },
  { command: '노래' },
  { command: '노래 신청' },
  { command: '노래 목록' },
];

describe('findExactCommandMatch', () => {
  it('완전 일치하면 인수 없이 매칭한다', () => {
    expect(findExactCommandMatch('방제', commands)).toEqual({
      matched: { command: '방제' },
      args: '',
    });
  });

  it('공백으로 구분된 인수를 함께 반환한다', () => {
    expect(findExactCommandMatch('카페 링크 알려줘', commands)).toEqual({
      matched: { command: '카페' },
      args: '링크 알려줘',
    });
  });

  it('여러 명령어가 접두어로 겹치면 가장 긴 명령어를 우선한다', () => {
    expect(findExactCommandMatch('방제 수정 오늘은 저챗', commands)).toEqual({
      matched: { command: '방제 수정' },
      args: '오늘은 저챗',
    });
  });

  it("띄어쓰기 명령어('노래 신청')가 짧은 명령어('노래')보다 우선한다", () => {
    expect(findExactCommandMatch('노래 신청 LUCY 개화', commands)).toEqual({
      matched: { command: '노래 신청' },
      args: 'LUCY 개화',
    });
    expect(findExactCommandMatch('노래 목록', commands)?.matched.command).toBe('노래 목록');
    // 인수 없는 '노래' 는 그대로 '노래'
    expect(findExactCommandMatch('노래', commands)?.matched.command).toBe('노래');
    // 등록되지 않은 하위 명령은 '노래' 로 떨어지고 나머지가 인수가 된다
    expect(findExactCommandMatch('노래 없는것', commands)).toEqual({
      matched: { command: '노래' },
      args: '없는것',
    });
  });

  it('공백 없이 이어진 문자열은 접두어로 취급하지 않는다', () => {
    // "노래신청곡" 은 "노래 신청" 명령어가 아님
    expect(findExactCommandMatch('노래신청곡', commands)).toBeNull();
    // "방제수정" 도 "방제 수정"/"방제" 어느 쪽도 아님
    expect(findExactCommandMatch('방제수정', commands)).toBeNull();
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(findExactCommandMatch('  카페  ', commands)?.matched.command).toBe('카페');
  });

  it('매칭되는 명령어가 없으면 null', () => {
    expect(findExactCommandMatch('없는명령', commands)).toBeNull();
    expect(findExactCommandMatch('', commands)).toBeNull();
  });
});
