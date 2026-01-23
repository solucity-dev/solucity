import jwt, { type SignOptions } from 'jsonwebtoken';

import { ENV } from '../config/env';

export type JwtPayload = {
  sub: string;
  role: 'CUSTOMER' | 'SPECIALIST' | 'ADMIN';
};

const EXPIRES_IN: SignOptions['expiresIn'] =
  (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) ?? '7d';

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  // Rotación opcional: si falla con el nuevo, intenta con el viejo
  try {
    return jwt.verify(token, ENV.JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (ENV.JWT_SECRET_OLD) {
      return jwt.verify(token, ENV.JWT_SECRET_OLD) as JwtPayload;
    }
    throw err;
  }
}
