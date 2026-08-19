import { describe, expect, it } from 'vitest';

import { findExactCommandMatch } from '..';

const commands = [
  { command: '방제' },
  { command: '방제 수정' },
  { command: '카페' },
  { command: '노래신청' },
];

describe('findExactCommandMatch', () => {
  it('완전 일치하면 인수 없이 매칭한다', () => {
    expect(findExactCommandMatch('방제', commands)).toEqual({ matched: { command: '방제' }, args: '' });
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

  it('공백 없이 이어진 문자열은 접두어로 취급하지 않는다', () => {
    // "노래신청곡" 은 "노래신청" 명령어가 아님
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
