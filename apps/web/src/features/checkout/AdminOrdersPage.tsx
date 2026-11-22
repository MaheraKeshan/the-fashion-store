import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminSignOutButton, useAdminAuth } from '../admin/AdminAuth';
import {
  fetchAdminOrders,
  type AdminOrder,
  type FulfillmentStatus,
  type OrderStatus,
  cancelAdminOrder,
  markCashReceived,
  updateAdminOrderStatus,
} from './adminOrdersApi';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminOrdersPage() {
  const { csrfToken } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState<string>();
  const [cancellationOrder, setCancellationOrder] = useState<string>();
  const [cancellationReason, setCancellationReason] = useState('');
  const [error, setError] = useState<string>();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const cursor = cursorHistory[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);

    fetchAdminOrders({
      ...(cursor && { cursor }),
      ...(statusFilter !== 'all' && { status: statusFilter }),
      signal: controller.signal,
    })
      .then((result) => {
        setOrders(result.orders);
        setNextCursor(result.nextCursor);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Unable to load orders.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [csrfToken, cursor, refreshIndex, statusFilter]);

  const changeStatus = async (order: AdminOrder, status: FulfillmentStatus) => {
    setUpdatingOrder(order.orderNumber);
    setError(undefined);
    try {
      const updatedOrder = await updateAdminOrderStatus(csrfToken, order.orderNumber, status);
      setOrders((current) =>
        current.map((item) =>
          item.orderNumber === updatedOrder.orderNumber ? updatedOrder : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update order status.');
    } finally {
      setUpdatingOrder(undefined);
    }
  };

  const replaceOrder = (updatedOrder: AdminOrder) => {
    setOrders((current) =>
      current.map((item) => (item.orderNumber === updatedOrder.orderNumber ? updatedOrder : item)),
    );
  };

  const cancelOrder = async (event: FormEvent<HTMLFormElement>, order: AdminOrder) => {
    event.preventDefault();
    setUpdatingOrder(order.orderNumber);
    setError(undefined);
    try {
      const updatedOrder = await cancelAdminOrder(csrfToken, order.orderNumber, cancellationReason);
      replaceOrder(updatedOrder);
      setCancellationOrder(undefined);
      setCancellationReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel order.');
    } finally {
      setUpdatingOrder(undefined);
    }
  };

  const recordCashReceived = async (order: AdminOrder) => {
    setUpdatingOrder(order.orderNumber);
    setError(undefined);
    try {
      replaceOrder(await markCashReceived(csrfToken, order.orderNumber));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record cash collection.');
    } finally {
      setUpdatingOrder(undefined);
    }
  };

  const changeFilter = (value: OrderStatus | 'all') => {
    setStatusFilter(value);
    setCursorHistory([undefined]);
    setPageIndex(0);
  };

  return (
    <main className="admin-orders-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← THE FASHION STORE
        </Link>
        <nav className="admin-nav" aria-label="Administrator pages">
          <Link to="/admin/delivery">DELIVERY SETTINGS</Link>
          <span>ADMIN · ORDERS</span>
          <AdminSignOutButton />
        </nav>
      </header>

      <section className="admin-orders-content">
        <p className="eyebrow">STORE OPERATIONS</p>
        <h1>Order management</h1>
        <p className="admin-orders-intro">
          Order details contain private customer information and are visible only to signed-in
          administrators.
        </p>

        <div className="admin-order-toolbar">
          <label>
            Filter by status
            <select
              value={statusFilter}
              onChange={(event) => changeFilter(event.target.value as OrderStatus | 'all')}
            >
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span>{isLoading ? 'Loading orders…' : `${orders.length} orders on this page`}</span>
          <button
            className="admin-clear-access"
            type="button"
            disabled={isLoading}
            onClick={() => setRefreshIndex((value) => value + 1)}
          >
            REFRESH
          </button>
        </div>

        {error && (
          <p className="catalog-filter-error" role="alert">
            {error}
          </p>
        )}
        {!isLoading && !error && orders.length === 0 && (
          <p className="admin-orders-empty" role="status">
            No orders match this view.
          </p>
        )}

        <div className="admin-order-list">
          {orders.map((order) => (
            <article className="admin-order-card" key={order.orderNumber}>
              <div className="admin-order-heading">
                <div>
                  <p className="eyebrow">ORDER · {order.orderNumber}</p>
                  <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time>
                </div>
                <span className={`admin-order-status status-${order.status}`}>
                  {statusLabels[order.status]}
                </span>
              </div>

              <div className="admin-order-details">
                <section>
                  <h2>Customer</h2>
                  <p>{order.customer.name}</p>
                  <p>
                    <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
                  </p>
                  {order.customer.email && <p>{order.customer.email}</p>}
                </section>
                <section>
                  <h2>Delivery</h2>
                  <address>
                    {order.deliveryAddress.line1}
                    {order.deliveryAddress.line2 && `, ${order.deliveryAddress.line2}`}
                    <br />
                    {order.deliveryAddress.area}
                    {order.deliveryAddress.postalCode && ` · ${order.deliveryAddress.postalCode}`}
                  </address>
                  {order.deliveryAddress.instructions && (
                    <p>Note: {order.deliveryAddress.instructions}</p>
                  )}
                </section>
                <section>
                  <h2>Items</h2>
                  <ul>
                    {order.items.map((item) => (
                      <li key={item.variantId}>
                        {item.productName} · {item.size} / {item.color} × {item.quantity}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h2>Cash on delivery</h2>
                  <p>Subtotal · {priceFormatter.format(order.subtotalLkr)}</p>
                  <p>Delivery · {priceFormatter.format(order.deliveryFeeLkr)}</p>
                  <strong>Total · {priceFormatter.format(order.totalLkr)}</strong>
                  <p>
                    Payment ·{' '}
                    {order.paymentStatus === 'paid' ? 'Cash received' : order.paymentStatus}
                  </p>
                </section>
              </div>

              {order.cancellation && (
                <p className="admin-order-cancellation">
                  Cancelled {formatOrderDate(order.cancellation.cancelledAt)} ·{' '}
                  {order.cancellation.reason}
                </p>
              )}

              {(order.nextStatuses.length > 0 || order.canCancel || order.canMarkCashReceived) && (
                <div className="admin-order-actions">
                  <span>
                    {order.nextStatuses.length > 0
                      ? 'Update fulfillment status'
                      : order.canCancel
                        ? 'Order actions'
                        : 'Payment action'}
                  </span>
                  {order.nextStatuses.map((status) => (
                    <button
                      className="admin-order-action"
                      key={status}
                      type="button"
                      disabled={
                        updatingOrder === order.orderNumber ||
                        cancellationOrder === order.orderNumber
                      }
                      onClick={() => void changeStatus(order, status)}
                    >
                      {updatingOrder === order.orderNumber
                        ? 'UPDATING…'
                        : `MARK ${statusLabels[status].toUpperCase()}`}
                    </button>
                  ))}
                  {order.canCancel && cancellationOrder !== order.orderNumber && (
                    <button
                      className="admin-order-action admin-order-action-secondary"
                      type="button"
                      disabled={updatingOrder === order.orderNumber}
                      onClick={() => {
                        setCancellationOrder(order.orderNumber);
                        setCancellationReason('');
                      }}
                    >
                      CANCEL ORDER
                    </button>
                  )}
                  {order.canMarkCashReceived && (
                    <button
                      className="admin-order-action"
                      type="button"
                      disabled={updatingOrder === order.orderNumber}
                      onClick={() => void recordCashReceived(order)}
                    >
                      {updatingOrder === order.orderNumber ? 'UPDATING…' : 'MARK CASH RECEIVED'}
                    </button>
                  )}
                </div>
              )}
              {cancellationOrder === order.orderNumber && (
                <form
                  className="admin-cancellation-form"
                  onSubmit={(event) => void cancelOrder(event, order)}
                >
                  <label>
                    Cancellation reason
                    <textarea
                      value={cancellationReason}
                      onChange={(event) => setCancellationReason(event.target.value)}
                      minLength={5}
                      maxLength={300}
                      required
                      rows={3}
                    />
                  </label>
                  <div>
                    <button
                      className="admin-order-action admin-order-action-danger"
                      type="submit"
                      disabled={
                        updatingOrder === order.orderNumber || cancellationReason.trim().length < 5
                      }
                    >
                      {updatingOrder === order.orderNumber ? 'CANCELLING…' : 'CONFIRM CANCELLATION'}
                    </button>
                    <button
                      className="admin-order-action admin-order-action-secondary"
                      type="button"
                      disabled={updatingOrder === order.orderNumber}
                      onClick={() => {
                        setCancellationOrder(undefined);
                        setCancellationReason('');
                      }}
                    >
                      KEEP ORDER
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>

        <nav className="admin-order-pagination" aria-label="Order pages">
          <button
            type="button"
            disabled={pageIndex === 0 || isLoading}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            PREVIOUS
          </button>
          <span>Page {pageIndex + 1}</span>
          <button
            type="button"
            disabled={!nextCursor || isLoading}
            onClick={() => {
              if (!nextCursor) return;
              setCursorHistory((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
              setPageIndex((current) => current + 1);
            }}
          >
            NEXT
          </button>
        </nav>
      </section>
    </main>
  );
}
