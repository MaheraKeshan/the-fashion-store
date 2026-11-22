import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  fetchProducts,
  type Product,
  type ProductGender,
  type ProductSort,
} from './productApi';
import { WishlistButton } from '../wishlist/WishlistButton';

interface ProductCatalogProps {
  gender?: ProductGender;
  isPlusSize: boolean;
  onGenderChange: (gender?: ProductGender) => void;
  onPlusSizeChange: (isPlusSize: boolean) => void;
}

const genders: { label: string; value?: ProductGender }[] = [
  { label: 'ALL', value: undefined },
  { label: 'WOMEN', value: 'women' },
  { label: 'MEN', value: 'men' },
  { label: 'KIDS', value: 'kids' },
];

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  const availableSizes = [
    ...new Set(
      product.variants
        .filter((variant) => variant.isActive && variant.stockQuantity > 0)
        .map((variant) => variant.size),
    ),
  ];
  const isAvailable = availableSizes.length > 0;
  const startingVariant = product.variants.reduce((lowest, variant) =>
    variant.price < lowest.price ? variant : lowest,
  );
  const isPlusSize = product.collections.some((collection) => collection.slug === 'plus-size');

  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <Link
          to={`/products/${encodeURIComponent(product.slug)}`}
          aria-label={`View ${product.name}`}
        >
          {image ? (
            <img className="product-image" src={image.url} alt={image.alt} loading="lazy" />
          ) : (
            <div className="product-image-fallback" aria-hidden="true">
              THE FASHION STORE
            </div>
          )}
        </Link>
        {isPlusSize && <span className="product-label">PLUS SIZE</span>}
        {!isAvailable && <span className="product-label product-label-muted">SOLD OUT</span>}
        <WishlistButton
          slug={product.slug}
          name={product.name}
          className="product-wishlist-button"
        />
      </div>
      <div className="product-card-info">
        <div className="product-name-row">
          <h3>
            <Link to={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link>
          </h3>
          <span>From {priceFormatter.format(startingVariant.price)}</span>
        </div>
        {startingVariant.compareAtPrice !== undefined &&
          startingVariant.compareAtPrice > startingVariant.price && (
            <p className="product-compare-price">
              <span className="sr-only">Was </span>
              {priceFormatter.format(startingVariant.compareAtPrice)}
            </p>
          )}
        <p className="product-description">{product.description}</p>
        {isAvailable && <p className="product-sizes">Sizes {availableSizes.join(' · ')}</p>}
      </div>
    </article>
  );
}

export function ProductCatalog({
  gender,
  isPlusSize,
  onGenderChange,
  onPlusSizeChange,
}: ProductCatalogProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sort, setSort] = useState<ProductSort>('newest');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const minPrice = minPriceInput.trim() ? Number(minPriceInput) : undefined;
  const maxPrice = maxPriceInput.trim() ? Number(maxPriceInput) : undefined;
  const invalidMinPrice =
    minPrice !== undefined && (!Number.isSafeInteger(minPrice) || minPrice < 0);
  const invalidMaxPrice =
    maxPrice !== undefined && (!Number.isSafeInteger(maxPrice) || maxPrice < 0);
  const filterError = invalidMinPrice
    ? 'Enter a valid minimum price in whole LKR.'
    : invalidMaxPrice
      ? 'Enter a valid maximum price in whole LKR.'
      : minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice
        ? 'Minimum price must not exceed maximum price.'
        : undefined;

  const query = useInfiniteQuery({
    queryKey: ['products', gender, isPlusSize, search, size, color, minPrice, maxPrice, sort],
    queryFn: ({ pageParam }) =>
      fetchProducts(
        {
          gender,
          isPlusSize,
          search,
          size: size.trim() || undefined,
          color: color.trim() || undefined,
          minPrice,
          maxPrice,
          sort,
        },
        pageParam,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    placeholderData: (previousData) => previousData,
    enabled: !filterError,
  });
  const products = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;

  return (
    <div className="catalog">
      <div className="catalog-toolbar">
        <div className="catalog-filters" role="group" aria-label="Filter products by gender">
          {genders.map((item) => (
            <button
              className={`filter-button ${gender === item.value && !isPlusSize ? 'filter-button-active' : ''}`}
              type="button"
              key={item.label}
              aria-pressed={gender === item.value && !isPlusSize}
              onClick={() => {
                onGenderChange(item.value);
                onPlusSizeChange(false);
              }}
            >
              {item.label}
            </button>
          ))}
          <button
            className={`filter-button ${isPlusSize ? 'filter-button-active' : ''}`}
            type="button"
            aria-pressed={isPlusSize}
            onClick={() => {
              onGenderChange(undefined);
              onPlusSizeChange(!isPlusSize);
            }}
          >
            PLUS SIZE
          </button>
        </div>
        <label className="catalog-search">
          <span className="sr-only">Search products</span>
          <input
            id="catalog-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search the collection"
          />
        </label>
      </div>

      <div className="catalog-refinements">
        <label>
          <span>SIZE</span>
          <input
            type="text"
            value={size}
            onChange={(event) => setSize(event.target.value)}
            placeholder="Any size"
            maxLength={30}
          />
        </label>
        <label>
          <span>COLOUR</span>
          <input
            type="text"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="Any colour"
            maxLength={50}
          />
        </label>
        <label>
          <span>MIN LKR</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={minPriceInput}
            onChange={(event) => setMinPriceInput(event.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          <span>MAX LKR</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={maxPriceInput}
            onChange={(event) => setMaxPriceInput(event.target.value)}
            placeholder="No limit"
          />
        </label>
        <label>
          <span>SORT BY</span>
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'newest' || value === 'price-asc' || value === 'price-desc') {
                setSort(value);
              }
            }}
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <button
          className="catalog-clear-filters"
          type="button"
          onClick={() => {
            setSearchInput('');
            setSize('');
            setColor('');
            setMinPriceInput('');
            setMaxPriceInput('');
            setSort('newest');
            onGenderChange(undefined);
            onPlusSizeChange(false);
          }}
        >
          CLEAR ALL
        </button>
      </div>

      {filterError && (
        <p className="catalog-filter-error" role="alert">
          {filterError}
        </p>
      )}

      {!filterError && query.isPending ? (
        <p className="catalog-message" role="status">
          Loading the collection…
        </p>
      ) : !filterError && query.isError && !query.data ? (
        <div className="catalog-message catalog-error" role="alert">
          <p>{query.error.message || 'The collection could not be loaded.'}</p>
          <button className="text-link" type="button" onClick={() => void query.refetch()}>
            TRY AGAIN
          </button>
        </div>
      ) : !filterError && products.length === 0 ? (
        <div className="catalog-message">
          <p>No pieces match your search just yet.</p>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setSearchInput('');
              onGenderChange(undefined);
              onPlusSizeChange(false);
            }}
          >
            CLEAR FILTERS
          </button>
        </div>
      ) : !filterError ? (
        <>
          <p className="catalog-result-count" aria-live="polite">
            {query.isFetching
              ? 'Updating collection…'
              : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}${total > products.length ? ` of ${total}` : ''}`}
          </p>
          {query.isError && query.data && (
            <p className="catalog-error" role="alert">
              {query.error.message}
            </p>
          )}
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
          {query.hasNextPage && !query.isPlaceholderData && (
            <button
              className="catalog-load-more"
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'LOADING…' : 'LOAD MORE'}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
