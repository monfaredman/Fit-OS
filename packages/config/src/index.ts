/**
 * Environment configuration — one flat, zod-validated snapshot of process.env.
 *
 * No dotenv dependency: a small loader walks up from cwd for the first `.env`,
 * and anything already in process.env wins. Mirrors the Vieral/Trend convention
 * so the two repos behave identically.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

let envFileLoaded = false;

function applyEnvFile(path: string): void {
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables always win over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Walk up to 6 directories looking for a `.env`. Idempotent. */
export function loadDotEnv(startDir: string = process.cwd()): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      applyEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

const bool01 = z.enum(['0', '1']).default('0');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** API listen port. */
  PORT: z.coerce.number().int().positive().default(3000),
  /** Allowed browser origin for the Desk. */
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3001'),

  /** Owner connection — migrations and seed only. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Application connection. Must be a NOBYPASSRLS role (D-004) — a table owner
   * silently bypasses every RLS policy. Falls back to DATABASE_URL in dev.
   */
  DATABASE_APP_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6380'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  DEFAULT_TIMEZONE: z.string().min(1).default('Asia/Tehran'),

  /** Arrears below this are not blocked at the door. Integer Rial. */
  ARREARS_GRACE_RIAL: z.coerce.number().int().nonnegative().default(500_000),
  /** Receptionist discount cap, percent. */
  DISCOUNT_MAX_PCT: z.coerce.number().int().min(0).max(100).default(20),
  /** Manager write-off cap. Integer Rial. */
  WRITEOFF_MAX_RIAL: z.coerce.number().int().nonnegative().default(5_000_000),

  SEED_ORG_NAME: z.string().min(1).default('باشگاه نمونه'),
  SEED_MEMBER_COUNT: z.coerce.number().int().positive().max(20_000).default(600),

  /** Use fixtures instead of live external calls (SMS, PSP). */
  USE_FIXTURES: bool01,
});

export type AppConfig = z.infer<typeof envSchema>;

/** Validate a source (defaults to process.env). Throws a readable list on failure. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (source === process.env) loadDotEnv();
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const config = parsed.data;

  if (config.NODE_ENV === 'production') {
    if (config.SESSION_SECRET.startsWith('dev-only')) {
      throw new Error('SESSION_SECRET is still the development default in production');
    }
    if (!config.DATABASE_APP_URL) {
      throw new Error(
        'DATABASE_APP_URL is required in production — the API must not connect as the table owner (D-004)',
      );
    }
  }
  return config;
}

let cached: AppConfig | undefined;

/** Memoized config. Use this everywhere except tests. */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test helper. */
export function resetConfigCache(): void {
  cached = undefined;
  envFileLoaded = false;
}

/**
 * Connection string the application should use. Prefers the NOBYPASSRLS role;
 * falls back to the owner in development so a fresh clone runs without extra setup.
 */
export function appDatabaseUrl(config: AppConfig = getConfig()): string {
  return config.DATABASE_APP_URL ?? config.DATABASE_URL;
}
