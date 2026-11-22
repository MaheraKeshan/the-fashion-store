import { z } from 'zod';
import { API_URL } from '../catalog/productApi';

const adminSessionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({
      email: z.string().email(),
      role: z.literal('admin'),
    }),
    csrfToken: z.string().min(32),
    expiresAt: z.string().datetime(),
  }),
});

const signOutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ signedOut: z.literal(true) }),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export type AdminSession = z.infer<typeof adminSessionSchema>['data'];

async function readPayload(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new AdminAuthError(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `${fallback} (HTTP ${response.status}).`,
      response.status,
    );
  }
  return payload;
}

export async function fetchAdminSession(signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/admin/auth/session`, {
    credentials: 'include',
    signal,
  });
  const payload = await readPayload(response, 'Unable to verify administrator session');
  const result = adminSessionSchema.safeParse(payload);
  if (!result.success) throw new Error('The administrator session returned an invalid response.');
  return result.data.data;
}

export async function loginAdmin(email: string, password: string) {
  const response = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readPayload(response, 'Unable to sign in');
  const result = adminSessionSchema.safeParse(payload);
  if (!result.success) throw new Error('The administrator sign-in returned an invalid response.');
  return result.data.data;
}

export async function logoutAdmin(csrfToken: string) {
  const response = await fetch(`${API_URL}/admin/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  const payload = await readPayload(response, 'Unable to sign out');
  const result = signOutResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The administrator sign-out returned an invalid response.');
}
