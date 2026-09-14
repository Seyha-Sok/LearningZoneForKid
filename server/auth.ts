import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import type { Config } from './config.js';

export function createAuth(pool: Pool, config: Config) {
  return betterAuth({
    appName: 'Little Letters',
    database: pool,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    trustedOrigins: config.origins,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, requireEmailVerification: false },
    user: { additionalFields: { phone: { type: 'string', required: false } } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 100, customRules: { '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 10 } } },
    advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] }, useSecureCookies: config.baseURL.startsWith('https://'), defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' } },
  });
}
export type Auth = ReturnType<typeof createAuth>;
