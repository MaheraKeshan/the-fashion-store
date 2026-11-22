import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { CUSTOMER_SESSION_TTL_SECONDS } from '../constants/customer-session.js';

const cookieName =
  env.NODE_ENV === 'production' ? '__Host-tfs-customer-session' : 'tfs-customer-session';

export function readCustomerSessionCookie(req: Request): string | undefined {
  const prefix = `${cookieName}=`;
  const cookie = req
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return undefined;
  return decodeURIComponent(cookie.slice(prefix.length)) || undefined;
}

export function setCustomerSessionCookie(res: Response, token: string) {
  const attributes = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${CUSTOMER_SESSION_TTL_SECONDS}`,
  ];
  if (env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
}

export function clearCustomerSessionCookie(res: Response) {
  const attributes = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
}
