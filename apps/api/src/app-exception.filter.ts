import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { AppError } from '@gymos/contracts';
import { getLogger } from './logging/logger.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): void;
}

/**
 * One error envelope for everything: stable English `code`, Persian `message`
 * shown to the user verbatim. design/api-design.md §3.
 *
 * Unknown errors never leak a stack trace to the client — they are logged
 * server-side and returned as a generic internal error.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly log = getLogger();

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();

    if (exception instanceof AppError) {
      reply.status(exception.status).send(exception.toEnvelope());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      reply.status(status).send({
        error: {
          code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          message:
            status === 404
              ? 'یافت نشد.'
              : typeof body === 'string'
                ? body
                : ((body as { message?: string }).message ?? 'خطایی رخ داد.'),
        },
      });
      return;
    }

    // A ledger imbalance reaching here is a P1: the transaction rolled back, so
    // no money moved, but something tried to write an unbalanced book.
    const message = exception instanceof Error ? exception.message : String(exception);
    const isLedger = /unbalanced|append-only|at least 2 required/.test(message);
    this.log.error(
      { err: exception, ledgerViolation: isLedger || undefined },
      'unhandled exception',
    );

    reply.status(isLedger ? 500 : HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: isLedger ? 'LEDGER_UNBALANCED' : 'INTERNAL_ERROR',
        message: isLedger
          ? 'خطای داخلی در ثبت مالی. تغییری اعمال نشد.'
          : 'خطای داخلی. لطفاً دوباره تلاش کنید.',
      },
    });
  }
}
