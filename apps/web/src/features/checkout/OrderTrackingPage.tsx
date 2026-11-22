import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trackOrder, type TrackedOrder } from './orderTrackingApi';

const statusLabels: Record<TrackedOrder['status'], string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  processing: 'Preparing your order',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function OrderTrackingPage() {
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get('orderNumber') ?? '');
  const [phone, setPhone] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const submitTrackingRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTrackedOrder(undefined);
    setError(undefined);
    setIsLoading(true);
    try {
      setTrackedOrder(await trackOrder(orderNumber, phone));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to look up this order.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="checkout-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← THE FASHION STORE
        </Link>
      </header>

      <section className="checkout-content order-tracking-content">
        <p className="eyebrow">ORDER TRACKING</p>
        <h1>Find your order</h1>
        <p className="order-tracking-intro">
          Enter your order number and the mobile number used at checkout. For privacy, tracking
          shows order status only.
        </p>

        <form className="checkout-form order-tracking-form" onSubmit={submitTrackingRequest}>
          <label>
            Order number
            <input
              autoComplete="off"
              autoCapitalize="characters"
              required
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="TFS-XXXXXXXX-XXXXXXXX"
            />
          </label>
          <label>
            Checkout mobile number
            <input
              autoComplete="tel"
              inputMode="tel"
              type="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+94 77 123 4567"
            />
          </label>
          {error && (
            <p className="catalog-filter-error" role="alert">
              {error}
            </p>
          )}
          <button className="cart-add-button" type="submit" disabled={isLoading}>
            {isLoading ? 'CHECKING…' : 'TRACK ORDER'}
          </button>
        </form>

        {trackedOrder && (
          <section className="order-tracking-result" aria-live="polite">
            <p className="eyebrow">ORDER · {trackedOrder.orderNumber}</p>
            <h2>{statusLabels[trackedOrder.status]}</h2>
            <p>Placed {formatOrderDate(trackedOrder.createdAt)}</p>
            <p>Last updated {formatOrderDate(trackedOrder.updatedAt)}</p>
          </section>
        )}
      </section>
    </main>
  );
}
