'use server';

import { jwtVerify, SignJWT } from 'jose';

export interface JwtPayload {
  id: number;
  role: 'admin' | 'streamer';
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable');
}

// TextEncoder로 변환된 secret (Edge 호환)
const secretKey = new TextEncoder().encode(JWT_SECRET);

// JWT 발급
export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);

  return jwt;
}

// JWT 검증
export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secretKey);

  return payload as unknown as JwtPayload;
}
