import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { ADMIN_SESSION_TTL_SECONDS } from '../constants/admin-session.js';

const cookieName = env.NODE_ENV === 'production' ? '__Host-tfs-admin-session' : 'tfs-admin-session';
export function readAdminSessionCookie(req: Request): string | undefined {
  const cookieHeader = req.get('cookie');
  if (!cookieHeader) return undefined;

  const prefix = `${cookieName}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return undefined;

  const value = cookie.slice(prefix.length);
  return value || undefined;
}

export function setAdminSessionCookie(res: Response, token: string) {
  const attributes = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
  ];
  if (env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
}

export function clearAdminSessionCookie(res: Response) {
  const attributes = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (env.NODE_ENV === 'production') attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
}
