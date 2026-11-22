import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchProductBySlug, type Product } from '../catalog/productApi';
import { WishlistButton } from './WishlistButton';
import { useWishlistStore } from './wishlistStore';
import { ShoppingBagLink } from '../cart/ShoppingBagLink';

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

export function WishlistPage() {
  const slugs = useWishlistStore((state) => state.slugs);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all(
      slugs.map(async (slug) => {
        try {
          return await fetchProductBySlug(slug);
        } catch {
          return undefined;
        }
      }),
    ).then((items) => {
      if (active) {
        setProducts(items.filter((item): item is Product => Boolean(item)));
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [slugs]);

  return (
    <main className="wishlist-page">
      <header className="wishlist-header">
        <Link className="product-detail-back" to="/">
          ← CONTINUE SHOPPING
        </Link>
        <Link className="wordmark" to="/" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </Link>
        <div className="wishlist-header-actions">
          <Heart aria-hidden="true" />
          <ShoppingBagLink />
        </div>
      </header>

      <section className="wishlist-content">
        <p className="eyebrow">YOUR SAVED EDIT</p>
        <h1>Wishlist</h1>
        {loading ? (
          <p className="catalog-message" role="status">
            Loading your saved pieces…
          </p>
        ) : products.length === 0 ? (
          <div className="wishlist-empty">
            <p>No pieces are saved yet.</p>
            <Link className="text-link" to="/">
              EXPLORE THE COLLECTION
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => {
              const startingVariant = product.variants.reduce((lowest, variant) =>
                variant.price < lowest.price ? variant : lowest,
              );
              const image = product.images[0];
              return (
                <article className="product-card" key={product._id}>
                  <div className="product-image-wrap">
                    <Link
                      to={`/products/${encodeURIComponent(product.slug)}`}
                      aria-label={`View ${product.name}`}
                    >
                      {image ? (
                        <img className="product-image" src={image.url} alt={image.alt} loading="lazy" />
                      ) : (
                        <div className="product-image-fallback">THE FASHION STORE</div>
                      )}
                    </Link>
                    <WishlistButton
                      slug={product.slug}
                      name={product.name}
                      className="product-wishlist-button"
                    />
                  </div>
                  <div className="product-card-info">
                    <div className="product-name-row">
                      <h3>
                        <Link to={`/products/${encodeURIComponent(product.slug)}`}>
                          {product.name}
                        </Link>
                      </h3>
                      <span>From {priceFormatter.format(startingVariant.price)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
