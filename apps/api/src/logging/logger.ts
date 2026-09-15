import { getConfig } from '@gymos/config';
import pino, { type Logger } from 'pino';

let memoized: Logger | undefined;

/** Memoized pino logger. Auth headers and tokens are redacted, never member PII. */
export function getLogger(): Logger {
  if (memoized) return memoized;
  const config = getConfig();
  memoized = pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'token',
        'tokenHash',
      ],
      censor: '[redacted]',
    },
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino/file', options: { destination: 1 } } }
      : {}),
  });
  return memoized;
}
