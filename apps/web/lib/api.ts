/**
 * API client. Types come from `@gymos/contracts`, so the Desk and the server
 * cannot drift — a renamed field is a compile error, not a runtime surprise.
 */

import type {
  ArrearsSummaryDto,
  CheckInResultDto,
  MemberCardDto,
  SearchResultDto,
  StaffSessionDto,
} from '@gymos/contracts';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const TOKEN_KEY = 'gymos:token';

export const getToken = (): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null): void => {
  if (typeof window === 'undefined') return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
};

/** The server's error envelope: Persian `message`, shown to the user verbatim. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as { error?: { code: string; message: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(e?.code ?? 'UNKNOWN', e?.message ?? 'خطای غیرمنتظره.', e?.details);
  }
  return body as T;
}

export const api = {
  login: (mobile: string, password: string) =>
    call<StaffSessionDto>('/v1/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify({ mobile, password }),
    }),

  me: () =>
    call<{ firstName: string; lastName: string; role: string; capabilities: string[] }>(
      '/v1/auth/me',
    ),

  search: (q: string) =>
    call<SearchResultDto[]>(`/v1/search?q=${encodeURIComponent(q)}&limit=8`),

  card: (id: string) => call<MemberCardDto>(`/v1/people/${id}`),

  checkIn: (personId: string, override = false) =>
    call<CheckInResultDto>('/v1/check-ins', {
      method: 'POST',
      body: JSON.stringify({
        personId,
        // Client-generated and stable across retries, so a replay is a no-op.
        clientEventId: `desk:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        method: override ? 'manual' : 'qr',
        override,
      }),
    }),

  pay: (personId: string, amountRial: number) =>
    call<{ id: string; arrearsRial: number }>('/v1/payments', {
      method: 'POST',
      headers: {
        // One key per user action, not per HTTP attempt: a retry replays, a
        // second button press is a new payment.
        'Idempotency-Key': `desk:${personId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      },
      body: JSON.stringify({ personId, method: 'cash', amountRial }),
    }),

  arrears: () => call<ArrearsSummaryDto>('/v1/arrears?limit=8&agedOverDays=7'),

  checkInsToday: () =>
    call<
      { id: string; firstName: string; lastName: string; admitted: boolean; occurredAt: string }[]
    >('/v1/check-ins?limit=12'),
};
