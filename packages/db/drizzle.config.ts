import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://gymos:gymos@localhost:5433/gymos',
  },
  verbose: true,
  strict: true,
} satisfies Config;
