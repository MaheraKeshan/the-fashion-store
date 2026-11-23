export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

const nextOrderStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed'],
  confirmed: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function getNextOrderStatuses(status: OrderStatus): readonly OrderStatus[] {
  return nextOrderStatuses[status];
}

export function canAdvanceOrderStatus(
  status: OrderStatus,
  nextStatus: OrderStatus,
  paymentMethod: 'cash-on-delivery' | 'payhere',
  paymentStatus: PaymentStatus,
): boolean {
  if (!nextOrderStatuses[status].includes(nextStatus)) return false;
  if (nextStatus === 'processing' && paymentMethod === 'payhere' && paymentStatus !== 'paid') {
    return false;
  }
  return true;
}

export function canCancelOrder(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  return (status === 'pending' || status === 'confirmed') && paymentStatus === 'unpaid';
}

export function canMarkCashReceived(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  return status === 'delivered' && paymentStatus === 'unpaid';
}
