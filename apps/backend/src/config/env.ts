// apps/backend/src/config/env.ts

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

function get(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v?.trim() || fallback;
}

function assertStrongSecret(name: string, value: string) {
  // mínimo razonable para prod
  if (value.length < 32) {
    throw new Error(`${name} is too short. Use 32+ chars.`);
  }
}

// 🔒 PORT validado (evita NaN / valores inválidos)
const portRaw = get('PORT', '3000')!;
const port = Number(portRaw);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
}

export const ENV = {
  NODE_ENV: get('NODE_ENV', 'development')!,
  PORT: port,
  JWT_SECRET: '',
  JWT_SECRET_OLD: get('JWT_SECRET_OLD'),
  JWT_REFRESH_SECRET: get('JWT_REFRESH_SECRET'),
};

const isProd = ENV.NODE_ENV === 'production';

if (isProd) {
  ENV.JWT_SECRET = mustGet('JWT_SECRET');
  assertStrongSecret('JWT_SECRET', ENV.JWT_SECRET);

  if (ENV.JWT_REFRESH_SECRET) {
    assertStrongSecret('JWT_REFRESH_SECRET', ENV.JWT_REFRESH_SECRET);
  }
} else {
  // dev fallback permitido
  ENV.JWT_SECRET = get('JWT_SECRET', 'dev-secret')!;
}
