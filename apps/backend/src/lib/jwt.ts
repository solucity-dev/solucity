import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

export type JwtPayload = {
  sub: string;
  role: 'CUSTOMER' | 'SPECIALIST' | 'ADMIN';
};

// Tipar bien para @types/jsonwebtoken v9
const SECRET: Secret = process.env.JWT_SECRET ?? 'dev-secret';
const EXPIRES_IN: SignOptions['expiresIn'] =
  (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) ?? '7d';

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
