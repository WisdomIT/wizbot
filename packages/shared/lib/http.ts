// http.ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface HttpRequestOptions extends RequestInit {
  params?: Record<string, string | number>;
  json?: any;
  timeout?: number; // milliseconds
  baseUrl?: string;
}

export async function http<T>(
  url: string,
  method: HttpMethod = 'GET',
  options: HttpRequestOptions = {},
): Promise<T> {
  const { params, json, timeout = 10000, baseUrl = '', headers, ...rest } = options;

  // 1. URL 생성 및 쿼리 파라미터 추가
  const fullUrl = new URL(url, baseUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      fullUrl.searchParams.append(key, String(value)),
    );
  }

  // 2. 요청 옵션 구성
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: json ? JSON.stringify(json) : undefined,
    signal: controller.signal,
    ...rest,
  };

  // 3. 요청 실행
  try {
    const res = await fetch(fullUrl.toString(), fetchOptions);
    clearTimeout(id);

    if (!res.ok) {
      const text = await res.text();
      throw new HttpError(res.status, res.statusText, text);
    }

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await res.json();
    } else {
      // 비 JSON 응답 처리 (예: text, blob 등)
      return (await res.text()) as unknown as T;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw err;
  }
}

// 에러 객체
export class HttpError extends Error {
  constructor(public status: number, public statusText: string, public responseText: string) {
    super(`HTTP ${status} - ${statusText}: ${responseText}`);
  }
}
