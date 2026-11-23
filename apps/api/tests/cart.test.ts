import assert from 'node:assert/strict';
import test from 'node:test';
import { cartQuoteRequestSchema, customerCartUpdateSchema } from '../src/schemas/cart.js';

const firstVariantId = '507f1f77bcf86cd799439011';
const secondVariantId = '507f1f77bcf86cd799439012';

test('cart quote accepts unique variant ids and bounded integer quantities', () => {
  const result = cartQuoteRequestSchema.safeParse({
    items: [
      { variantId: firstVariantId, quantity: 2 },
      { variantId: secondVariantId, quantity: 1 },
    ],
  });

  assert.equal(result.success, true);
});

test('cart quote rejects duplicate variants and client-supplied prices', () => {
  const duplicateVariants = cartQuoteRequestSchema.safeParse({
    items: [
      { variantId: firstVariantId, quantity: 1 },
      { variantId: firstVariantId, quantity: 2 },
    ],
  });
  const clientPrice = cartQuoteRequestSchema.safeParse({
    items: [{ variantId: firstVariantId, quantity: 1, price: 1 }],
  });
  const caseVariantDuplicate = cartQuoteRequestSchema.safeParse({
    items: [
      { variantId: firstVariantId, quantity: 1 },
      { variantId: firstVariantId.toUpperCase(), quantity: 1 },
    ],
  });

  assert.equal(duplicateVariants.success, false);
  assert.equal(clientPrice.success, false);
  assert.equal(caseVariantDuplicate.success, false);
});

test('cart quote rejects invalid quantities and more than 50 lines', () => {
  const invalidQuantity = cartQuoteRequestSchema.safeParse({
    items: [{ variantId: firstVariantId, quantity: 100 }],
  });
  const tooManyItems = cartQuoteRequestSchema.safeParse({
    items: Array.from({ length: 51 }, (_, index) => ({
      variantId: (index + 1).toString(16).padStart(24, '0'),
      quantity: 1,
    })),
  });

  assert.equal(invalidQuantity.success, false);
  assert.equal(tooManyItems.success, false);
});

test('saved carts allow clearing but enforce the same item and quantity limits', () => {
  assert.equal(customerCartUpdateSchema.safeParse({ items: [] }).success, true);
  assert.equal(
    customerCartUpdateSchema.safeParse({
      items: [
        { variantId: firstVariantId, quantity: 1 },
        { variantId: firstVariantId.toUpperCase(), quantity: 1 },
      ],
    }).success,
    false,
  );
  assert.equal(
    customerCartUpdateSchema.safeParse({
      items: [{ variantId: firstVariantId, quantity: 100 }],
    }).success,
    false,
  );
});
