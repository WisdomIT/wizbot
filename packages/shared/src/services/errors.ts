export type ServiceErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT' | 'FORBIDDEN';

/**
 * 서비스 계층의 정책 오류. message는 사용자에게 그대로 보여줄 수 있는 문구(한국어)로 작성한다.
 * - tRPC 라우터: 그대로 던져 클라이언트에 메시지 전달 (#17에서 TRPCError 매핑 예정)
 * - 챗봇 함수: 잡아서 채팅 응답 메시지로 변환
 */
export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
