function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; configure the backend .env file`);
  return value;
}

export function readConfig() {
  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const baseURL = required('BETTER_AUTH_URL');
  const origins = required('APP_ORIGINS').split(',').map(value => new URL(value.trim()).origin);
  if (!origins.includes(new URL(baseURL).origin)) throw new Error('APP_ORIGINS must include BETTER_AUTH_URL');
  if (process.env.NODE_ENV === 'production' && [baseURL, ...origins].some(value => !value.startsWith('https://'))) throw new Error('Production requires HTTPS origins');
  return { databaseURL: required('DATABASE_URL'), secret, baseURL, origins };
}
export type Config = ReturnType<typeof readConfig>;
