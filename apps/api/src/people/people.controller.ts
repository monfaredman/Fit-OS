import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createPersonBodySchema,
  searchQuerySchema,
  updatePersonBodySchema,
  type MemberCardDto,
  type SearchResultDto,
} from '@gymos/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequireCapability, CapabilityGuard } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { PeopleService } from './people.service.js';

@ApiTags('people')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, CapabilityGuard)
@Controller('v1')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  /** The Desk's hot path. Budget: p95 under 400ms. */
  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<SearchResultDto[]> {
    return this.people.search(user, searchQuerySchema.parse(query));
  }

  /** The member card: subscription, expiry, debt, locker — always in that order. */
  @Get('people/:id')
  card(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<MemberCardDto> {
    return this.people.getCard(user, id);
  }

  @Post('people')
  @RequireCapability('person.create')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<{ id: string }> {
    return this.people.create(user, createPersonBodySchema.parse(body));
  }

  @Patch('people/:id')
  @RequireCapability('person.edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    return this.people.update(user, id, updatePersonBodySchema.parse(body));
  }
}
