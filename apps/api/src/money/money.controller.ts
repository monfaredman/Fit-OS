import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AppError,
  arrearsQuerySchema,
  createPaymentBodySchema,
  drawerCloseBodySchema,
  walletTopUpBodySchema,
  type ArrearsSummaryDto,
} from '@gymos/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CapabilityGuard, RequireCapability } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { MoneyService } from './money.service.js';

interface ReplyLike {
  header(name: string, value: string): void;
  status(code: number): ReplyLike;
  send(body: unknown): void;
}

@ApiTags('money')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, CapabilityGuard)
@Controller('v1')
export class MoneyController {
  constructor(private readonly money: MoneyService) {}

  /** Requires `Idempotency-Key`. A retry replays; a different body under the same key is refused. */
  @Post('payments')
  @RequireCapability('payment.take')
  async pay(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
    const parsed = createPaymentBodySchema.parse(body);
    const { result, replayed } = await this.money.takePayment(user, key, parsed);
    reply.header('Idempotency-Replayed', String(replayed));
    reply.status(201).send(result);
  }

  @Post('wallet/topups')
  @RequireCapability('wallet.topup')
  async topUp(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
    const parsed = walletTopUpBodySchema.parse(body);
    const { result, replayed } = await this.money.topUpWallet(user, key, parsed);
    reply.header('Idempotency-Replayed', String(replayed));
    reply.status(201).send(result);
  }

  /** The open shift. Expected cash is derived from the ledger. */
  @Get('drawer/current')
  @RequireCapability('drawer.close')
  drawerCurrent(@CurrentUser() user: AuthUser) {
    return this.money.drawerCurrent(user);
  }

  /** Record the count. Append-only — a close is evidence, never edited. */
  @Post('drawer/close')
  @RequireCapability('drawer.close')
  drawerClose(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = drawerCloseBodySchema.parse(body);
    return this.money.drawerClose(user, parsed.countedRial, parsed.note);
  }

  /** Owner-visible history. Visibility is what makes the control real. */
  @Get('drawer/history')
  @RequireCapability('drawer.variance.all')
  drawerHistory(@CurrentUser() user: AuthUser) {
    return this.money.drawerHistory(user);
  }

  @Get('people/:id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.money.ledger(user, id);
  }

  /** The arrears screen — the number every sales conversation opens with. */
  @Get('arrears')
  arrears(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<ArrearsSummaryDto> {
    return this.money.arrears(user, arrearsQuerySchema.parse(query));
  }
}
