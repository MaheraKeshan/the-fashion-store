import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const adminLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const createAdminAccountSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(14).max(128),
  })
  .strict();

export type AdminLogin = z.infer<typeof adminLoginSchema>;
