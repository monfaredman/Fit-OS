import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './staff-auth.guard.js';

/** Throws loudly if used on a route that forgot `@UseGuards(StaffAuthGuard)`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used without StaffAuthGuard');
  return req.user;
});
