import type { UsageToken } from '@wizbot/shared/src/chatbot/definitions';

import { Badge } from '@/components/ui/badge';

/** 챗봇 명령어 사용법 토큰 렌더러 — arg 는 Badge, text 는 평문 (#26 26-b) */
export function UsageTokens({ tokens }: { tokens: UsageToken[] }) {
  return (
    <span className="text-sm inline-flex flex-wrap items-center gap-1">
      {tokens.map((token, index) =>
        'arg' in token ? (
          <Badge key={index} variant="outline">
            {token.arg}
          </Badge>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </span>
  );
}
