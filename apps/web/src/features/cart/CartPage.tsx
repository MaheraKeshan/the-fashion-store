import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchCartQuote } from './cartApi';
import { useCartStore } from './cartStore';

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

export function CartPage() {
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const quoteQuery = useQuery({
    queryKey: ['cartQuote', items],
    queryFn: () => fetchCartQuote(items),
    enabled: items.length > 0,
  });

  return (
    <main className="cart-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← CONTINUE SHOPPING
        </Link>
        <Link className="wordmark" to="/" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </Link>
      </header>

      <section className="cart-content">
        <p className="eyebrow">YOUR EDIT</p>
        <h1>Shopping bag</h1>

        {items.length === 0 ? (
          <div className="cart-empty">
            <p>Your bag is waiting for something considered.</p>
            <Link className="primary-button" to="/">
              EXPLORE THE COLLECTION
            </Link>
          </div>
        ) : quoteQuery.isPending ? (
          <p className="catalog-message" role="status">
            Checking current prices and availability…
          </p>
        ) : quoteQuery.isError ? (
          <div className="cart-error" role="alert">
            <p>{quoteQuery.error.message}</p>
            <button type="button" className="text-link" onClick={() => void quoteQuery.refetch()}>
              TRY AGAIN
            </button>
            <button type="button" className="text-link" onClick={clearCart}>
              CLEAR BAG
            </button>
          </div>
        ) : (
          <>
            <div className="cart-layout">
              <div className="cart-items">
                {quoteQuery.data.items.map((item) => {
                  const name = item.product?.name ?? 'Unavailable item';
                  const description = item.variant
                    ? `${item.variant.size} · ${item.variant.color}`
                    : 'This item is no longer available.';

                  return (
                    <article className="cart-item" key={item.variantId}>
                      {item.product?.image ? (
                        <img src={item.product.image.url} alt={item.product.image.alt} />
                      ) : (
                        <div className="cart-item-image-fallback" aria-hidden="true">
                          THE FASHION STORE
                        </div>
                      )}
                      <div className="cart-item-info">
                        {item.product && item.available ? (
                          <Link to={`/products/${encodeURIComponent(item.product.slug)}`}>
                            <h2>{name}</h2>
                          </Link>
                        ) : (
                          <h2>{name}</h2>
                        )}
                        <p>{description}</p>
                        {item.unitPrice !== null && (
                          <p className="cart-item-price">{priceFormatter.format(item.unitPrice)}</p>
                        )}
                        {!item.available && (
                          <p className="cart-item-unavailable" role="status">
                            {item.availableQuantity > 0
                              ? `Only ${item.availableQuantity} currently available.`
                              : 'This item is no longer available.'}
                          </p>
                        )}
                        <div className="cart-item-actions">
                          <div className="cart-quantity">
                            <button
                              type="button"
                              aria-label={`Decrease quantity for ${name}`}
                              disabled={item.quantity <= 1}
                              onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                            >
                              −
                            </button>
                            <span aria-live="polite">{item.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Increase quantity for ${name}`}
                              disabled={item.quantity >= Math.min(item.availableQuantity, 99)}
                              onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                          <button
                            className="cart-remove"
                            type="button"
                            onClick={() => removeItem(item.variantId)}
                          >
                            REMOVE
                          </button>
                        </div>
                      </div>
                      <strong className="cart-line-total">
                        {item.lineTotal === null ? '—' : priceFormatter.format(item.lineTotal)}
                      </strong>
                    </article>
                  );
                })}
              </div>

              <aside className="cart-summary">
                <h2>Order summary</h2>
                <div>
                  <span>Subtotal</span>
                  <strong>
                    {quoteQuery.data.subtotal === null
                      ? 'Review availability'
                      : priceFormatter.format(quoteQuery.data.subtotal)}
                  </strong>
                </div>
                <p>Delivery charges and eligible areas are confirmed at checkout.</p>
                <p className="cart-checkout-note">
                  Current server-side prices and stock are rechecked before an order is accepted.
                </p>
                {quoteQuery.data.subtotal !== null && (
                  <Link className="cart-checkout-button" to="/checkout">
                    CONTINUE TO CHECKOUT
                  </Link>
                )}
              </aside>
            </div>
            <button className="cart-clear" type="button" onClick={clearCart}>
              CLEAR BAG
            </button>
          </>
        )}
      </section>
    </main>
  );
}
