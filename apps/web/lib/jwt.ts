import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export interface JwtPayload {
  id: number;
  role: 'admin' | 'streamer';
  iat?: number;
  exp?: number;
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
}
