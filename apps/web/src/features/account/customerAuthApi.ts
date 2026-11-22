import { z } from 'zod';
import { API_URL } from '../catalog/productApi';

const customerSessionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({
      name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      deliveryAddress: z
        .object({
          line1: z.string(),
          line2: z.string().optional(),
          area: z.string(),
          postalCode: z.string().optional(),
          instructions: z.string().optional(),
        })
        .optional(),
    }),
    csrfToken: z.string().min(32),
    expiresAt: z.string().datetime(),
  }),
});

const signOutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ signedOut: z.literal(true) }),
});

const errorResponseSchema = z.object({ message: z.string().optional() });

const customerOrdersResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      orderNumber: z.string(),
      status: z.string(),
      paymentMethod: z.enum(['cash-on-delivery', 'payhere']),
      paymentStatus: z.enum(['unpaid', 'paid', 'refunded']),
      currency: z.literal('LKR'),
      subtotalLkr: z.number().int().nonnegative(),
      deliveryFeeLkr: z.number().int().nonnegative(),
      totalLkr: z.number().int().nonnegative(),
      createdAt: z.string().datetime(),
    }),
  ),
  pagination: z.object({ nextCursor: z.string().optional() }),
});

export type CustomerOrder = z.infer<typeof customerOrdersResponseSchema>['data'][number];

export class CustomerAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CustomerAuthError';
  }
}

export type CustomerSession = z.infer<typeof customerSessionSchema>['data'];

async function readPayload(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(payload);
    throw new CustomerAuthError(
      error.success && error.data.message
        ? error.data.message
        : `${fallback} (HTTP ${response.status}).`,
      response.status,
    );
  }
  return payload;
}

export async function fetchCustomerSession(signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/customer/auth/session`, {
    credentials: 'include',
    signal,
  });
  const payload = await readPayload(response, 'Unable to verify your account');
  const result = customerSessionSchema.safeParse(payload);
  if (!result.success) throw new Error('The customer session returned an invalid response.');
  return result.data.data;
}

export async function registerCustomer(name: string, email: string, password: string) {
  const response = await fetch(`${API_URL}/customer/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const payload = await readPayload(response, 'Unable to create your account');
  const result = customerSessionSchema.safeParse(payload);
  if (!result.success) throw new Error('The account registration returned an invalid response.');
  return result.data.data;
}

export async function loginCustomer(email: string, password: string) {
  const response = await fetch(`${API_URL}/customer/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readPayload(response, 'Unable to sign in');
  const result = customerSessionSchema.safeParse(payload);
  if (!result.success) throw new Error('The account sign-in returned an invalid response.');
  return result.data.data;
}

export async function logoutCustomer(csrfToken: string) {
  const response = await fetch(`${API_URL}/customer/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  const payload = await readPayload(response, 'Unable to sign out');
  const result = signOutResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The account sign-out returned an invalid response.');
}

export async function fetchCustomerOrders(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`${API_URL}/customer/auth/orders${params.size ? `?${params}` : ''}`, {
    credentials: 'include',
  });
  const payload = await readPayload(response, 'Unable to load your orders');
  const result = customerOrdersResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The order history returned an invalid response.');
  return result.data;
}

export async function updateCustomerProfile(csrfToken: string, name: string, phone: string) {
  const profileResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
        deliveryAddress: z
          .object({
            line1: z.string(),
            line2: z.string().optional(),
            area: z.string(),
            postalCode: z.string().optional(),
            instructions: z.string().optional(),
          })
          .optional(),
      }),
    }),
  });
  const response = await fetch(`${API_URL}/customer/auth/profile`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ name, phone }),
  });
  const payload = await readPayload(response, 'Unable to update your profile');
  const result = profileResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The profile update returned an invalid response.');
  return result.data.data.user;
}

export async function updateCustomerDeliveryAddress(
  csrfToken: string,
  address: {
    line1: string;
    line2?: string;
    area: string;
    postalCode?: string;
    instructions?: string;
  },
) {
  const responseSchema = z.object({
    success: z.literal(true),
    data: z.object({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
        deliveryAddress: z
          .object({
            line1: z.string(),
            line2: z.string().optional(),
            area: z.string(),
            postalCode: z.string().optional(),
            instructions: z.string().optional(),
          })
          .optional(),
      }),
    }),
  });
  const response = await fetch(`${API_URL}/customer/auth/delivery-address`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(address),
  });
  const payload = await readPayload(response, 'Unable to save your delivery address');
  const result = responseSchema.safeParse(payload);
  if (!result.success) throw new Error('The address update returned an invalid response.');
  return result.data.data.user;
}

export async function changeCustomerPassword(
  csrfToken: string,
  currentPassword: string,
  newPassword: string,
) {
  const response = await fetch(`${API_URL}/customer/auth/password`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const payload = await readPayload(response, 'Unable to change your password');
  const result = z
    .object({
      success: z.literal(true),
      data: z.object({ passwordChanged: z.literal(true) }),
    })
    .safeParse(payload);
  if (!result.success) throw new Error('The password change returned an invalid response.');
}

const customerSessionsSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      isCurrent: z.boolean(),
      createdAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
    }),
  ),
});

export type CustomerSessionSummary = z.infer<typeof customerSessionsSchema>['data'][number];

export async function fetchCustomerSessions() {
  const response = await fetch(`${API_URL}/customer/auth/sessions`, {
    credentials: 'include',
  });
  const payload = await readPayload(response, 'Unable to load account sessions');
  const result = customerSessionsSchema.safeParse(payload);
  if (!result.success) throw new Error('The account sessions returned an invalid response.');
  return result.data.data;
}

export async function revokeOtherCustomerSessions(csrfToken: string) {
  const response = await fetch(`${API_URL}/customer/auth/sessions/revoke-others`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  const payload = await readPayload(response, 'Unable to revoke other sessions');
  const result = z
    .object({
      success: z.literal(true),
      data: z.object({ revokedOthers: z.literal(true) }),
    })
    .safeParse(payload);
  if (!result.success) throw new Error('The session revocation returned an invalid response.');
}

export async function requestCustomerPasswordReset(email: string) {
  const response = await fetch(`${API_URL}/customer/auth/password-reset/request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const payload = await readPayload(response, 'Unable to request a password reset');
  const result = z
    .object({
      success: z.literal(true),
      data: z.object({ requested: z.literal(true), message: z.string() }),
    })
    .safeParse(payload);
  if (!result.success) throw new Error('The password reset request returned an invalid response.');
  return result.data.data.message;
}

export async function completeCustomerPasswordReset(token: string, newPassword: string) {
  const response = await fetch(`${API_URL}/customer/auth/password-reset/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const payload = await readPayload(response, 'Unable to reset your password');
  const result = z
    .object({
      success: z.literal(true),
      data: z.object({ passwordReset: z.literal(true) }),
    })
    .safeParse(payload);
  if (!result.success) throw new Error('The password reset returned an invalid response.');
}
