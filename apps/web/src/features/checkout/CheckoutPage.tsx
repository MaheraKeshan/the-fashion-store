import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchCartQuote } from '../cart/cartApi';
import { useCartStore } from '../cart/cartStore';
import { fetchDeliverySettings } from './settingsApi';
import {
  placeCODOrder,
  placePayHereOrder,
  type CODOrderConfirmation,
  type CODOrderRequest,
} from './checkoutApi';
import { fetchCustomerSession } from '../account/customerAuthApi';

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

interface CheckoutFields {
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  area: string;
  postalCode: string;
  instructions: string;
}

const idempotencyStorageKey = 'fashion-store-cod-checkout-key';
const idempotencyRequestKey = 'fashion-store-cod-checkout-request-hash';

const emptyFields: CheckoutFields = {
  name: '',
  phone: '',
  email: '',
  line1: '',
  line2: '',
  area: '',
  postalCode: '',
  instructions: '',
};

function getIdempotencyKey() {
  const storedKey = globalThis.sessionStorage.getItem(idempotencyStorageKey);
  if (
    storedKey &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storedKey)
  ) {
    return storedKey;
  }
  const newKey = globalThis.crypto.randomUUID();
  globalThis.sessionStorage.setItem(idempotencyStorageKey, newKey);
  return newKey;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function fingerprintCheckout(request: CODOrderRequest): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(request));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function CheckoutPage() {
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const queryClient = useQueryClient();
  const [fields, setFields] = useState(emptyFields);
  const [confirmation, setConfirmation] = useState<CODOrderConfirmation>();
  const [paymentMethod, setPaymentMethod] = useState<'cash-on-delivery' | 'payhere'>(
    'cash-on-delivery',
  );
  useEffect(() => {
    const controller = new AbortController();
    fetchCustomerSession(controller.signal)
      .then((session) => {
        setFields((current) => ({
          ...current,
          name: current.name || session.user.name,
          phone: current.phone || session.user.phone || '',
          email: current.email || session.user.email,
          line1: current.line1 || session.user.deliveryAddress?.line1 || '',
          line2: current.line2 || session.user.deliveryAddress?.line2 || '',
          area: current.area || session.user.deliveryAddress?.area || '',
          postalCode:
            current.postalCode || session.user.deliveryAddress?.postalCode || '',
          instructions:
            current.instructions || session.user.deliveryAddress?.instructions || '',
        }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const quoteQuery = useQuery({
    queryKey: ['cartQuote', items],
    queryFn: () => fetchCartQuote(items),
    enabled: items.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const settingsQuery = useQuery({
    queryKey: ['deliverySettings'],
    queryFn: fetchDeliverySettings,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const orderMutation = useMutation({
    mutationFn: async (request: CODOrderRequest) => {
      const fingerprint = await fingerprintCheckout(request);
      const previousFingerprint = globalThis.sessionStorage.getItem(idempotencyRequestKey);
      if (previousFingerprint && previousFingerprint !== fingerprint) {
        const newKey = globalThis.crypto.randomUUID();
        globalThis.sessionStorage.setItem(idempotencyStorageKey, newKey);
      }
      globalThis.sessionStorage.setItem(idempotencyRequestKey, fingerprint);
      const activeKey =
        globalThis.sessionStorage.getItem(idempotencyStorageKey) ?? getIdempotencyKey();
      if (paymentMethod === 'payhere') {
        return placePayHereOrder(request, activeKey);
      }
      return { order: await placeCODOrder(request, activeKey) };
    },
    onSuccess: (result) => {
      if ('checkout' in result) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = result.checkout.actionUrl;
        for (const [name, value] of Object.entries(result.checkout.fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
        return;
      }
      setConfirmation(result.order);
      globalThis.sessionStorage.removeItem(idempotencyStorageKey);
      globalThis.sessionStorage.removeItem(idempotencyRequestKey);
      clearCart();
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['cartQuote', items] });
    },
  });

  const deliverySettings = settingsQuery.data;
  const quote = quoteQuery.data;
  const deliveryFeeLkr =
    deliverySettings?.pricingMethod === 'flat'
      ? deliverySettings.deliveryFeeLkr
      : deliverySettings?.deliveryAreaFees.find(
          (entry) => entry.area.toLocaleLowerCase('en') === fields.area.toLocaleLowerCase('en'),
        )?.feeLkr;
  const calculatedTotal =
    quote?.subtotal !== null &&
    quote?.subtotal !== undefined &&
    deliveryFeeLkr !== null &&
    deliveryFeeLkr !== undefined
      ? quote.subtotal + deliveryFeeLkr
      : null;
  const totalLkr =
    calculatedTotal !== null && Number.isSafeInteger(calculatedTotal) ? calculatedTotal : null;

  const updateField = <K extends keyof CheckoutFields>(key: K, value: CheckoutFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !quote ||
      quote.subtotal === null ||
      !fields.area ||
      deliveryFeeLkr === undefined ||
      deliveryFeeLkr === null
    ) {
      return;
    }

    const request: CODOrderRequest = {
      customer: {
        name: fields.name,
        phone: fields.phone,
        ...(fields.email.trim() && { email: fields.email.trim() }),
      },
      deliveryAddress: {
        line1: fields.line1,
        ...(fields.line2.trim() && { line2: fields.line2.trim() }),
        area: fields.area,
        ...(fields.postalCode.trim() && { postalCode: fields.postalCode.trim() }),
        ...(fields.instructions.trim() && { instructions: fields.instructions.trim() }),
      },
      items,
    };
    orderMutation.mutate(request);
  };

  if (confirmation) {
    return (
      <main className="checkout-page">
        <header className="product-detail-header">
          <Link className="product-detail-back" to="/">
            THE FASHION STORE
          </Link>
        </header>
        <section className="order-confirmation" aria-live="polite">
          <p className="eyebrow">ORDER RECEIVED</p>
          <h1>Thank you for your order.</h1>
          <p>Your order is pending confirmation. Payment is due in cash on delivery.</p>
          <div className="confirmation-summary">
            <div>
              <span>ORDER NUMBER</span>
              <strong>{confirmation.orderNumber}</strong>
            </div>
            <div>
              <span>SUBTOTAL</span>
              <strong>{priceFormatter.format(confirmation.subtotalLkr)}</strong>
            </div>
            <div>
              <span>DELIVERY</span>
              <strong>{priceFormatter.format(confirmation.deliveryFeeLkr)}</strong>
            </div>
            <div>
              <span>TOTAL DUE AT DELIVERY</span>
              <strong>{priceFormatter.format(confirmation.totalLkr)}</strong>
            </div>
          </div>
          <div className="order-confirmation-actions">
            <Link
              className="primary-button"
              to={`/track-order?orderNumber=${encodeURIComponent(confirmation.orderNumber)}`}
            >
              TRACK THIS ORDER
            </Link>
            <Link className="primary-button" to="/">
              CONTINUE SHOPPING
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="checkout-page">
        <section className="cart-empty">
          <p>Your shopping bag is empty.</p>
          <Link className="primary-button" to="/">
            EXPLORE THE COLLECTION
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/bag">
          ← RETURN TO BAG
        </Link>
        <Link className="wordmark" to="/" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </Link>
      </header>

      <section className="checkout-content">
        <p className="eyebrow">CHECKOUT</p>
        <h1>Delivery details</h1>

        {(quoteQuery.isPending || settingsQuery.isPending) && (
          <p className="catalog-message" role="status">
            Rechecking your bag and delivery details…
          </p>
        )}
        {quoteQuery.isError && (
          <div className="cart-error" role="alert">
            <p>{quoteQuery.error.message}</p>
            <Link className="text-link" to="/bag">
              REVIEW YOUR BAG
            </Link>
          </div>
        )}
        {settingsQuery.isError && (
          <p className="catalog-filter-error" role="alert">
            {settingsQuery.error.message}
          </p>
        )}

        {quote && deliverySettings && (
          <>
            {!deliverySettings.confirmedForProduction && (
              <p className="checkout-config-warning" role="status">
                COD checkout is unavailable until an administrator confirms the delivery fee and
                coverage settings.
              </p>
            )}
            {quote.subtotal === null && (
              <p className="checkout-config-warning" role="alert">
                One or more items need attention. Update your bag before placing an order.
              </p>
            )}

            <div className="checkout-layout">
              <form className="checkout-form" onSubmit={handleSubmit}>
                <fieldset>
                  <legend>Contact information</legend>
                  <label>
                    Full name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={fields.name}
                      onChange={(event) => updateField('name', event.target.value)}
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      inputMode="tel"
                      placeholder="+94 77 123 4567"
                      value={fields.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                    />
                  </label>
                  <label>
                    Email <span>(optional)</span>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={fields.email}
                      onChange={(event) => updateField('email', event.target.value)}
                    />
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Delivery address</legend>
                  <label>
                    Address line 1
                    <input
                      name="line1"
                      autoComplete="address-line1"
                      required
                      minLength={5}
                      maxLength={200}
                      value={fields.line1}
                      onChange={(event) => updateField('line1', event.target.value)}
                    />
                  </label>
                  <label>
                    Address line 2 <span>(optional)</span>
                    <input
                      name="line2"
                      autoComplete="address-line2"
                      maxLength={200}
                      value={fields.line2}
                      onChange={(event) => updateField('line2', event.target.value)}
                    />
                  </label>
                  <label>
                    Delivery area
                    <select
                      name="area"
                      required
                      value={fields.area}
                      onChange={(event) => updateField('area', event.target.value)}
                    >
                      <option value="">Select a covered area</option>
                      {deliverySettings.coveredAreas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Postal code <span>(optional)</span>
                    <input
                      name="postalCode"
                      inputMode="numeric"
                      pattern="\d{5}"
                      autoComplete="postal-code"
                      value={fields.postalCode}
                      onChange={(event) => updateField('postalCode', event.target.value)}
                    />
                  </label>
                  <label>
                    Delivery instructions <span>(optional)</span>
                    <textarea
                      name="instructions"
                      rows={3}
                      maxLength={300}
                      value={fields.instructions}
                      onChange={(event) => updateField('instructions', event.target.value)}
                    />
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Payment method</legend>
                  <label>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash-on-delivery"
                      checked={paymentMethod === 'cash-on-delivery'}
                      onChange={() => setPaymentMethod('cash-on-delivery')}
                    />
                    Cash on delivery
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="payhere"
                      checked={paymentMethod === 'payhere'}
                      onChange={() => setPaymentMethod('payhere')}
                    />
                    Pay online with PayHere
                  </label>
                </fieldset>

                {orderMutation.isError && (
                  <p className="catalog-filter-error" role="alert">
                    {orderMutation.error.message}
                  </p>
                )}
                <p className="cod-payment-note">
                  {paymentMethod === 'payhere'
                    ? 'You will be redirected securely to PayHere to complete payment.'
                    : 'Pay the confirmed order total in cash when your order is delivered.'}
                </p>
                <button
                  className="cart-add-button"
                  type="submit"
                  disabled={
                    orderMutation.isPending ||
                    !deliverySettings.confirmedForProduction ||
                    quote.subtotal === null ||
                    !fields.area ||
                    deliveryFeeLkr === undefined ||
                    deliveryFeeLkr === null
                  }
                >
                  {orderMutation.isPending
                    ? 'PLACING ORDER…'
                    : paymentMethod === 'payhere'
                      ? 'CONTINUE TO PAYHERE'
                      : 'PLACE COD ORDER'}
                </button>
              </form>

              <aside className="cart-summary checkout-summary">
                <h2>Order summary</h2>
                {quote.items.map((item) => (
                  <div className="checkout-summary-item" key={item.variantId}>
                    <span>
                      {item.product?.name ?? 'Unavailable item'} × {item.quantity}
                    </span>
                    <strong>
                      {item.lineTotal === null
                        ? 'Review availability'
                        : priceFormatter.format(item.lineTotal)}
                    </strong>
                  </div>
                ))}
                <div>
                  <span>Subtotal</span>
                  <strong>
                    {quote.subtotal === null
                      ? 'Review availability'
                      : priceFormatter.format(quote.subtotal)}
                  </strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>
                    {deliveryFeeLkr === undefined || deliveryFeeLkr === null || !fields.area
                      ? 'Select an area'
                      : priceFormatter.format(deliveryFeeLkr)}
                  </strong>
                </div>
                <div className="checkout-total">
                  <span>Total</span>
                  <strong>{totalLkr === null ? '—' : priceFormatter.format(totalLkr)}</strong>
                </div>
                {deliverySettings.pricingMethod === 'flat' && (
                  <p>
                    {deliverySettings.deliveryFeeLkr === null
                      ? 'Delivery fee is not configured.'
                      : `Flat delivery fee: ${priceFormatter.format(deliverySettings.deliveryFeeLkr)} per order.`}
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
