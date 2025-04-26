export const CHZZK_URI = 'https://openapi.chzzk.naver.com';

export const CHZZK_ID = process.env.CHZZK_ID ?? '';
export const CHZZK_SECRET = process.env.CHZZK_SECRET ?? '';

export function ACCESS_TOKEN_HEADERS(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const CLIENT_AUTH_HEADERS = {
  'Client-Id': CHZZK_ID,
  'Client-Secret': CHZZK_SECRET,
  'Content-Type': 'application/json',
};
