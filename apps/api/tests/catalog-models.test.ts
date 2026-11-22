import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { Category } from '../src/models/category.js';
import { Collection } from '../src/models/collection.js';
import { Product } from '../src/models/product.js';
import { ProductVariant } from '../src/models/product-variant.js';

test('products require a category and a supported gender', () => {
  const missingCategory = new Product({
    name: 'Test',
    slug: 'test',
    description: 'Test description',
    gender: 'women',
  });
  assert.ok(missingCategory.validateSync()?.errors.categoryId);

  const invalidGender = new Product({
    name: 'Test',
    slug: 'test',
    description: 'Test description',
    categoryId: new Types.ObjectId(),
    gender: 'adult',
  });
  assert.ok(invalidGender.validateSync()?.errors.gender);
});

test('variants require a product and validate integer prices and stock', () => {
  const invalidVariant = new ProductVariant({
    sku: 'sku-1',
    size: 'M',
    color: 'Black',
    price: 1200.5,
    stockQuantity: -1,
  });
  const errors = invalidVariant.validateSync()?.errors;

  assert.ok(errors?.productId);
  assert.ok(errors?.price);
  assert.ok(errors?.stockQuantity);
});

test('variant schema declares unique SKU and product size/colour indexes', () => {
  const indexes = ProductVariant.schema.indexes();

  assert.ok(indexes.some(([keys, options]) => keys.sku === 1 && options.unique === true));
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.productId === 1 &&
        keys.size === 1 &&
        keys.color === 1 &&
        options.unique === true &&
        options.collation?.strength === 2,
    ),
  );
});

test('category and collection slugs are unique', () => {
  for (const schema of [Category.schema, Collection.schema]) {
    assert.ok(
      schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique === true),
    );
  }
});
