import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const customerRegistrationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: z.string().min(10).max(128),
  })
  .strict();

export const customerLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

const optionalPhoneSchema = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s()-]/g, ''))
      .pipe(z.string().regex(/^(?:\+94|0)7\d{8}$/)),
  ])
  .optional()
  .transform((value) => (value ? value : undefined));

export const updateCustomerProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: optionalPhoneSchema,
  })
  .strict();

export const updateCustomerAddressSchema = z
  .object({
    line1: z.string().trim().min(5).max(200),
    line2: z.string().trim().max(200).optional(),
    area: z.string().trim().min(2).max(100),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/)
      .optional(),
    instructions: z.string().trim().max(300).optional(),
  })
  .strict();

export const changeCustomerPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  })
  .strict();

export const deleteCustomerAccountSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export const requestCustomerPasswordResetSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const completeCustomerPasswordResetSchema = z
  .object({
    token: z.string().min(32).max(128),
    newPassword: z.string().min(10).max(128),
  })
  .strict();

export type CustomerRegistration = z.infer<typeof customerRegistrationSchema>;
export type CustomerLogin = z.infer<typeof customerLoginSchema>;
