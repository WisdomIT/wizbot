import { describe, expect, it } from 'vitest';

import { functions } from '..';
import {
  chatbotFunctionDefinitionMap,
  chatbotFunctionDefinitions,
  getUsageString,
  isChatbotFunctionKey,
} from '../definitions';

describe('정의 ↔ 핸들러 일치', () => {
  // satisfies 가 컴파일 타임에 보장하지만, 스프레드 병합 실수(중복 키 덮어쓰기 등)를 런타임에서도 고정한다
  it('모든 정의 키에 핸들러가 있다', () => {
    for (const key of Object.keys(chatbotFunctionDefinitions)) {
      expect(functions, `핸들러 누락: ${key}`).toHaveProperty(key);
      expect(typeof (functions as Record<string, unknown>)[key]).toBe('function');
    }
  });

  it('정의에 없는 핸들러가 없다', () => {
    for (const key of Object.keys(functions)) {
      expect(isChatbotFunctionKey(key), `정의 누락: ${key}`).toBe(true);
    }
  });
});

describe('usage 표기', () => {
  it('토큰 → 문자열 변환 (arg 는 <> 로)', () => {
    expect(getUsageString('createCommandEcho', '추가')).toBe('!추가 <명령어 이름> <응답>');
    expect(getUsageString('getChzzkTitle', '방제')).toBe('!방제');
    expect(getUsageString('deleteChatbotRepeat', '반복삭제')).toBe(
      '!반복삭제 <반복메시지 id> or <all>',
    );
  });

  it('option 이 있는 정의는 updateSpecificCommandEcho 뿐이다 (현재)', () => {
    const withOption = Object.entries(chatbotFunctionDefinitionMap)
      .filter(([, def]) => def.option)
      .map(([key]) => key);
    expect(withOption).toEqual(['updateSpecificCommandEcho']);
  });

  it('isChatbotFunctionKey', () => {
    expect(isChatbotFunctionKey('getChzzkTitle')).toBe(true);
    expect(isChatbotFunctionKey('doesNotExist')).toBe(false);
  });
});
