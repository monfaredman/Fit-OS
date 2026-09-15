import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';
import { getLogger } from './logger.js';

/**
 * Bridges Nest's logger onto pino so there is one log stream, not two.
 *
 * The private field is `pino`, not `log` — `log` is part of the LoggerService
 * interface, and naming the instance the same thing collides with it.
 */
export class PinoLoggerService implements LoggerService {
  private readonly pino: Logger = getLogger();

  log(message: unknown, context?: string): void {
    this.pino.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.pino.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.pino.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.pino.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.pino.trace({ context }, String(message));
  }
}
