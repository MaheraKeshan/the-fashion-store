import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/category.js';
import { Collection } from '../src/models/collection.js';
import { Product } from '../src/models/product.js';
import { ProductVariant } from '../src/models/product-variant.js';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase, hyphen-separated slug.');

const categoryImportSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema,
    description: z.string().trim().optional(),
    parentSlug: slugSchema.optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

const collectionImportSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema,
    description: z.string().trim().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const variantImportSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .transform((sku) => sku.toUpperCase()),
    size: z.string().trim().min(1),
    color: z.string().trim().min(1),
    price: z.number().int().nonnegative(),
    compareAtPrice: z.number().int().nonnegative().optional(),
    stockQuantity: z.number().int().nonnegative(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine(
    (variant) => variant.compareAtPrice === undefined || variant.compareAtPrice > variant.price,
    {
      message: 'compareAtPrice must be greater than price.',
      path: ['compareAtPrice'],
    },
  );

const productImportSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema,
    description: z.string().trim().min(1),
    categorySlug: slugSchema,
    collectionSlugs: z.array(slugSchema).default([]),
    gender: z.enum(['women', 'men', 'kids', 'unisex']),
    tags: z.array(z.string().trim().min(1)).default([]),
    images: z
      .array(
        z.object({
          url: z.string().url(),
          alt: z.string().trim().min(1),
        }),
      )
      .default([]),
    brand: z.string().trim().min(1).optional(),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    variants: z.array(variantImportSchema).min(1),
  })
  .strict();

const importFileSchema = z
  .object({
    categories: z.array(categoryImportSchema).default([]),
    collections: z.array(collectionImportSchema).default([]),
    products: z.array(productImportSchema).default([]),
  })
  .strict();

type ImportFile = z.infer<typeof importFileSchema>;

function getArguments(args: string[]) {
  let file: string | undefined;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--file') {
      const fileArg = args[index + 1];
      if (!fileArg || fileArg.startsWith('--')) {
        throw new Error('Provide a product JSON file after --file.');
      }
      file = fileArg;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!file) throw new Error('Provide a product JSON file with --file <path>.');
  return { file: resolve(file), apply };
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateImportReferences(input: ImportFile) {
  const categorySlugs = new Set(input.categories.map((category) => category.slug));
  const collectionSlugs = new Set(input.collections.map((collection) => collection.slug));

  for (const category of input.categories) {
    if (category.parentSlug && !categorySlugs.has(category.parentSlug)) {
      throw new Error(`Unknown parent category slug: ${category.parentSlug}`);
    }

    const ancestors = new Set([category.slug]);
    let parentSlug = category.parentSlug;
    while (parentSlug) {
      if (ancestors.has(parentSlug)) {
        throw new Error(`Category hierarchy contains a cycle at ${parentSlug}.`);
      }
      ancestors.add(parentSlug);
      parentSlug = input.categories.find((item) => item.slug === parentSlug)?.parentSlug;
    }
  }

  for (const product of input.products) {
    if (!categorySlugs.has(product.categorySlug)) {
      throw new Error(
        `Product "${product.slug}" references category "${product.categorySlug}" not defined in this file.`,
      );
    }
    for (const collectionSlug of product.collectionSlugs) {
      if (!collectionSlugs.has(collectionSlug)) {
        throw new Error(
          `Product "${product.slug}" references collection "${collectionSlug}" not defined in this file.`,
        );
      }
    }
    assertUnique(
      product.variants.map(
        (variant) =>
          `${variant.size.toLocaleLowerCase()}\u0000${variant.color.toLocaleLowerCase()}`,
      ),
      `size/colour combination for ${product.slug}`,
    );
  }

  assertUnique(
    input.categories.map((category) => category.slug),
    'category slug',
  );
  assertUnique(
    input.collections.map((collection) => collection.slug),
    'collection slug',
  );
  assertUnique(
    input.products.map((product) => product.slug),
    'product slug',
  );
  assertUnique(
    input.products.flatMap((product) => product.variants.map((variant) => variant.sku)),
    'variant SKU',
  );
}

async function assertExistingSkusBelongToTheirProduct(input: ImportFile) {
  const productSlugs = input.products.map((product) => product.slug);
  const skus = input.products.flatMap((product) => product.variants.map((variant) => variant.sku));
  const [existingProducts, existingVariants] = await Promise.all([
    Product.find({ slug: { $in: productSlugs } })
      .select('_id slug')
      .lean()
      .exec(),
    ProductVariant.find({ sku: { $in: skus } })
      .select('sku productId')
      .lean()
      .exec(),
  ]);
  const productIdsBySlug = new Map(existingProducts.map((product) => [product.slug, product._id]));
  const variantsBySku = new Map(
    existingVariants.map((variant) => [variant.sku, variant.productId]),
  );

  for (const product of input.products) {
    const existingProductId = productIdsBySlug.get(product.slug);
    for (const variant of product.variants) {
      const existingOwnerId = variantsBySku.get(variant.sku);
      if (existingOwnerId && (!existingProductId || !existingOwnerId.equals(existingProductId))) {
        throw new Error(`SKU "${variant.sku}" already belongs to a different product.`);
      }
    }
  }
}

async function importRecords(input: ImportFile) {
  const categoryIds = new Map<string, Types.ObjectId>();
  for (const category of input.categories) {
    const savedCategory = await Category.findOneAndUpdate(
      { slug: category.slug },
      {
        $set: {
          name: category.name,
          slug: category.slug,
          description: category.description,
          isActive: category.isActive,
          sortOrder: category.sortOrder,
        },
        $setOnInsert: { parentId: null },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .select('_id')
      .exec();
    if (!savedCategory) throw new Error(`Could not save category "${category.slug}".`);
    categoryIds.set(category.slug, savedCategory._id);
  }

  for (const category of input.categories) {
    await Category.updateOne(
      { _id: categoryIds.get(category.slug) },
      { $set: { parentId: category.parentSlug ? categoryIds.get(category.parentSlug) : null } },
      { runValidators: true },
    ).exec();
  }

  const collectionIds = new Map<string, Types.ObjectId>();
  for (const collection of input.collections) {
    const savedCollection = await Collection.findOneAndUpdate(
      { slug: collection.slug },
      {
        $set: {
          name: collection.name,
          slug: collection.slug,
          description: collection.description,
          isActive: collection.isActive,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .select('_id')
      .exec();
    if (!savedCollection) throw new Error(`Could not save collection "${collection.slug}".`);
    collectionIds.set(collection.slug, savedCollection._id);
  }

  let importedProducts = 0;
  let importedVariants = 0;
  for (const product of input.products) {
    const savedProduct = await Product.findOneAndUpdate(
      { slug: product.slug },
      {
        $set: {
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId: categoryIds.get(product.categorySlug),
          collectionIds: product.collectionSlugs.map((slug) => collectionIds.get(slug)),
          gender: product.gender,
          tags: product.tags,
          images: product.images,
          brand: product.brand,
          isActive: product.isActive,
          isFeatured: product.isFeatured,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
      .select('_id')
      .exec();
    if (!savedProduct) throw new Error(`Could not save product "${product.slug}".`);
    importedProducts += 1;

    for (const variant of product.variants) {
      await ProductVariant.findOneAndUpdate(
        { sku: variant.sku },
        { $set: { ...variant, productId: savedProduct._id } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      ).exec();
      importedVariants += 1;
    }
  }

  return { importedProducts, importedVariants };
}

async function main() {
  const { file, apply } = getArguments(process.argv.slice(2));
  const inputValue: unknown = JSON.parse(await readFile(file, 'utf8'));
  const result = importFileSchema.safeParse(inputValue);

  if (!result.success) {
    console.error('Catalog import file is invalid:');
    for (const issue of result.error.issues) {
      console.error(`- ${issue.path.join('.') || 'catalog'}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  validateImportReferences(result.data);
  const recordCount =
    result.data.categories.length + result.data.collections.length + result.data.products.length;
  console.log(
    `Validated ${result.data.categories.length} categories, ${result.data.collections.length} collections, and ${result.data.products.length} products from ${file}.`,
  );

  if (!apply) {
    console.log('Dry run only; MongoDB was not modified. Re-run with --apply to import.');
    return;
  }
  if (recordCount === 0) throw new Error('The import file contains no catalog records.');
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not configured in apps/api/.env.');

  const connected = await connectDatabase();
  if (!connected) throw new Error('Could not connect to MongoDB; no records were imported.');

  try {
    await assertExistingSkusBelongToTheirProduct(result.data);
    const imported = await importRecords(result.data);
    console.log(
      `Imported ${result.data.categories.length} categories, ${result.data.collections.length} collections, ${imported.importedProducts} products, and ${imported.importedVariants} variants.`,
    );
  } finally {
    await Product.db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Catalog import failed:', error);
  process.exitCode = 1;
});
