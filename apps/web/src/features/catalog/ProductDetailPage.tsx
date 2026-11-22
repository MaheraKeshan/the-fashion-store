import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ShoppingBagLink } from '../cart/ShoppingBagLink';
import { useCartStore } from '../cart/cartStore';
import { fetchProductBySlug } from './productApi';
import { WishlistButton } from '../wishlist/WishlistButton';

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

export function ProductDetailPage() {
  const { slug } = useParams();
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [addedToBag, setAddedToBag] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.items);
  const productQuery = useQuery({
    queryKey: ['product', slug],
    queryFn: () => fetchProductBySlug(slug ?? ''),
    enabled: Boolean(slug),
  });

  if (productQuery.isPending) {
    return (
      <main className="product-detail-page">
        <p className="catalog-message" role="status">
          Loading product details…
        </p>
      </main>
    );
  }

  if (productQuery.isError) {
    return (
      <main className="product-detail-page">
        <div className="product-detail-message" role="alert">
          <p>{productQuery.error.message}</p>
          <Link className="text-link" to="/">
            RETURN TO THE COLLECTION
          </Link>
        </div>
      </main>
    );
  }

  const product = productQuery.data;
  const selectedVariant =
    product.variants.find((variant) => variant._id === selectedVariantId) ??
    product.variants.find((variant) => variant.stockQuantity > 0) ??
    product.variants[0];
  const existingQuantity =
    cartItems.find((item) => item.variantId === selectedVariant._id)?.quantity ?? 0;
  const isPlusSize = product.collections.some((collection) => collection.slug === 'plus-size');

  return (
    <main className="product-detail-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← CONTINUE SHOPPING
        </Link>
        <Link className="wordmark" to="/" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </Link>
        <ShoppingBagLink />
      </header>

      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">HOME</Link>
        <span aria-hidden="true">/</span>
        <span>{product.category.name.toUpperCase()}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name.toUpperCase()}</span>
      </nav>

      <section className="product-detail">
        <div className="product-detail-gallery" aria-label={`${product.name} images`}>
          {product.images.length > 0 ? (
            product.images.map((image, index) => (
              <img
                key={`${image.url}-${index}`}
                src={image.url}
                alt={image.alt}
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            ))
          ) : (
            <div className="product-image-fallback">THE FASHION STORE</div>
          )}
        </div>

        <div className="product-detail-info">
          <p className="eyebrow">{product.category.name.toUpperCase()}</p>
          <div className="product-detail-title-row">
            <h1>{product.name}</h1>
            <WishlistButton slug={product.slug} name={product.name} className="detail-wishlist-button" />
          </div>
          {product.brand && <p className="product-detail-brand">{product.brand}</p>}
          <p className="product-detail-price">{priceFormatter.format(selectedVariant.price)}</p>
          {selectedVariant.compareAtPrice !== undefined &&
            selectedVariant.compareAtPrice > selectedVariant.price && (
              <p className="product-detail-compare">
                <span className="sr-only">Was </span>
                {priceFormatter.format(selectedVariant.compareAtPrice)}
              </p>
            )}
          {isPlusSize && <span className="product-detail-label">PLUS SIZE</span>}
          <p className="product-detail-description">{product.description}</p>

          <fieldset className="variant-picker">
            <legend>
              Select size and colour{' '}
              <span>
                ({selectedVariant.size} / {selectedVariant.color})
              </span>
            </legend>
            <div className="variant-options">
              {product.variants.map((variant) => (
                <button
                  key={variant._id}
                  className={`variant-option ${selectedVariant._id === variant._id ? 'variant-option-selected' : ''}`}
                  type="button"
                  aria-pressed={selectedVariant._id === variant._id}
                  disabled={variant.stockQuantity === 0}
                  onClick={() => {
                    setSelectedVariantId(variant._id);
                    setAddedToBag(false);
                  }}
                >
                  <span>{variant.size}</span>
                  <span>{variant.color}</span>
                  {variant.stockQuantity === 0 && <span className="sr-only">, sold out</span>}
                </button>
              ))}
            </div>
          </fieldset>

          <p
            className={`product-stock ${selectedVariant.stockQuantity > 0 ? 'product-stock-available' : ''}`}
            role="status"
          >
            {selectedVariant.stockQuantity > 0 ? 'Available' : 'Currently out of stock'}
          </p>
          <button
            className="cart-add-button"
            type="button"
            disabled={
              selectedVariant.stockQuantity === 0 ||
              existingQuantity >= Math.min(selectedVariant.stockQuantity, 99)
            }
            onClick={() => {
              addItem(selectedVariant._id);
              setAddedToBag(true);
            }}
          >
            {selectedVariant.stockQuantity === 0
              ? 'OUT OF STOCK'
              : existingQuantity >= Math.min(selectedVariant.stockQuantity, 99)
                ? 'MAXIMUM AVAILABLE IN BAG'
                : 'ADD TO BAG'}
          </button>
          {addedToBag && (
            <p className="cart-added-message" role="status">
              Added to your bag.
            </p>
          )}
          <div className="product-detail-meta">
            <span>COLOUR</span>
            <strong>{selectedVariant.color}</strong>
          </div>
          {product.tags.length > 0 && (
            <div className="product-detail-meta">
              <span>DETAILS</span>
              <strong>{product.tags.join(' · ')}</strong>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
