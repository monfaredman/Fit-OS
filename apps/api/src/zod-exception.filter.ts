import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';

/** Fastify's reply is not typed against Nest, so declare what we use. */
interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): void;
}

/**
 * Controllers call `schema.parse(body)` inline — there is no ZodValidationPipe.
 * This turns the thrown ZodError into the standard envelope.
 */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    reply.status(HttpStatus.BAD_REQUEST).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'اطلاعات ارسالی معتبر نیست.',
        details: exception.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  }
}
