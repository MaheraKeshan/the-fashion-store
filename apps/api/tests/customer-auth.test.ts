import assert from 'node:assert/strict';
import test from 'node:test';
import { Customer } from '../src/models/customer.js';
import { CustomerSession } from '../src/models/customer-session.js';
import { Order } from '../src/models/order.js';
import {
  customerLoginSchema,
  customerRegistrationSchema,
  updateCustomerProfileSchema,
  updateCustomerAddressSchema,
  changeCustomerPasswordSchema,
  deleteCustomerAccountSchema,
  requestCustomerPasswordResetSchema,
  completeCustomerPasswordResetSchema,
} from '../src/schemas/customer-auth.js';
import { CustomerPasswordReset } from '../src/models/customer-password-reset.js';
import { customerWishlistUpdateSchema } from '../src/schemas/customer-saved-items.js';

test('customer registration normalizes email and rejects extra fields', () => {
  const result = customerRegistrationSchema.safeParse({
    name: '  Amaya Perera  ',
    email: ' AMAYA@EXAMPLE.COM ',
    password: 'a-long-password',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, 'Amaya Perera');
    assert.equal(result.data.email, 'amaya@example.com');
  }
  assert.equal(
    customerRegistrationSchema.safeParse({
      name: 'Amaya',
      email: 'amaya@example.com',
      password: 'a-long-password',
      role: 'admin',
    }).success,
    false,
  );
});

test('customer registration requires a secure-length password', () => {
  assert.equal(
    customerRegistrationSchema.safeParse({
      name: 'Amaya',
      email: 'amaya@example.com',
      password: 'too-short',
    }).success,
    false,
  );
  assert.equal(
    customerLoginSchema.safeParse({
      email: ' CUSTOMER@EXAMPLE.COM ',
      password: 'password',
    }).success,
    true,
  );
});

test('customer password and session secrets are excluded from default projections', () => {
  assert.equal(Customer.schema.path('passwordHash')?.options.select, false);
  assert.equal(Customer.schema.path('cartItems')?.options.select, false);
  assert.equal(Customer.schema.path('wishlistProductIds')?.options.select, false);
  assert.equal(CustomerSession.schema.path('tokenHash')?.options.select, false);
  assert.equal(CustomerSession.schema.path('csrfToken')?.options.select, false);
  assert.equal(CustomerSession.schema.path('expiresAt')?.options.expires, 0);
});

test('orders can be linked to a customer with a bounded history index', () => {
  assert.equal(Order.schema.path('customerId')?.options.ref, 'Customer');
  assert.ok(
    Order.schema
      .indexes()
      .some(([keys]) => keys.customerId === 1 && keys.createdAt === -1 && keys._id === -1),
  );
});

test('customer profile accepts name and normalized Sri Lankan mobile numbers', () => {
  const result = updateCustomerProfileSchema.safeParse({
    name: '  Amaya Perera  ',
    phone: '077 123 4567',
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, 'Amaya Perera');
    assert.equal(result.data.phone, '0771234567');
  }
  assert.equal(
    updateCustomerProfileSchema.safeParse({
      name: 'A',
      phone: '0771234567',
    }).success,
    false,
  );
  assert.equal(
    updateCustomerProfileSchema.safeParse({
      name: 'Amaya',
      phone: '',
    }).success,
    true,
  );
});

test('customer delivery address validates a complete address and postal code', () => {
  const result = updateCustomerAddressSchema.safeParse({
    line1: '12 Galle Road',
    line2: 'Apartment 4',
    area: 'Colombo 03',
    postalCode: '00300',
    instructions: 'Call before arrival',
  });
  assert.equal(result.success, true);
  assert.equal(
    updateCustomerAddressSchema.safeParse({
      line1: 'short',
      area: 'Colombo 03',
      postalCode: '030',
    }).success,
    false,
  );
});

test('customer password change requires current and sufficiently long new passwords', () => {
  assert.equal(
    changeCustomerPasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    }).success,
    true,
  );
  assert.equal(
    changeCustomerPasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'new-password',
    }).success,
    false,
  );
  assert.equal(
    changeCustomerPasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'short',
    }).success,
    false,
  );
});

test('account deletion requires the current password and rejects extra fields', () => {
  assert.equal(deleteCustomerAccountSchema.safeParse({ currentPassword: 'current-password' }).success, true);
  assert.equal(deleteCustomerAccountSchema.safeParse({ currentPassword: '' }).success, false);
  assert.equal(
    deleteCustomerAccountSchema.safeParse({
      currentPassword: 'current-password',
      confirm: true,
    }).success,
    false,
  );
});

test('password reset request and completion are strictly validated', () => {
  assert.equal(
    requestCustomerPasswordResetSchema.safeParse({
      email: ' RESET@EXAMPLE.COM ',
    }).success,
    true,
  );
  assert.equal(
    requestCustomerPasswordResetSchema.safeParse({
      email: 'not-an-email',
    }).success,
    false,
  );
  assert.equal(
    completeCustomerPasswordResetSchema.safeParse({
      token: 'a'.repeat(43),
      newPassword: 'a sufficiently long password',
    }).success,
    true,
  );
  assert.equal(
    completeCustomerPasswordResetSchema.safeParse({
      token: 'short',
      newPassword: 'a sufficiently long password',
    }).success,
    false,
  );
});

test('password reset token hashes are excluded from default projections and expire', () => {
  assert.equal(CustomerPasswordReset.schema.path('tokenHash')?.options.select, false);
  assert.equal(CustomerPasswordReset.schema.path('expiresAt')?.options.expires, 0);
});

test('customer wishlist accepts empty lists and rejects duplicate or excessive product IDs', () => {
  const firstProductId = '507f1f77bcf86cd799439011';
  assert.equal(customerWishlistUpdateSchema.safeParse({ productIds: [] }).success, true);
  assert.equal(
    customerWishlistUpdateSchema.safeParse({
      productIds: [firstProductId, firstProductId.toUpperCase()],
    }).success,
    false,
  );
  assert.equal(
    customerWishlistUpdateSchema.safeParse({
      productIds: Array.from({ length: 101 }, (_, index) =>
        (index + 1).toString(16).padStart(24, '0'),
      ),
    }).success,
    false,
  );
});
