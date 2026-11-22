import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { Order } from '../models/order.js';
import { ProductServiceError } from './product.service.js';

export interface PayHereCheckout {
  actionUrl: string;
  fields: Record<string, string>;
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex').toUpperCase();
}

export function buildPayHereCheckout(
  order: {
    orderNumber: string;
    totalLkr: number;
  },
  customer: {
    name: string;
    phone: string;
    email?: string;
  },
  deliveryAddress: {
    line1: string;
    line2?: string;
    area: string;
  },
): PayHereCheckout {
  if (!env.PAYHERE_MERCHANT_ID || !env.PAYHERE_MERCHANT_SECRET) {
    throw new ProductServiceError(
      'PayHere is not configured. Online payment is temporarily unavailable.',
      503,
    );
  }

  const amount = order.totalLkr.toFixed(2);
  const merchantSecretHash = md5(env.PAYHERE_MERCHANT_SECRET);
  const hash = md5(
    `${env.PAYHERE_MERCHANT_ID}${order.orderNumber}${amount}LKR${merchantSecretHash}`,
  );

  return {
    actionUrl:
      env.PAYHERE_MODE === 'live'
        ? 'https://www.payhere.lk/pay/checkout'
        : 'https://sandbox.payhere.lk/pay/checkout',
    fields: {
      merchant_id: env.PAYHERE_MERCHANT_ID,
      return_url: `${env.CLIENT_URL}/checkout`,
      cancel_url: `${env.CLIENT_URL}/checkout`,
      notify_url:
        env.PAYHERE_NOTIFY_URL ??
        `${env.CLIENT_URL.replace(/\/$/, '')}/api/v1/payments/payhere/notify`,
      order_id: order.orderNumber,
      items: 'The Fashion Store order',
      currency: 'LKR',
      amount,
      first_name: customer.name,
      last_name: '',
      phone: customer.phone,
      ...(customer.email && { email: customer.email }),
      address: [deliveryAddress.line1, deliveryAddress.line2].filter(Boolean).join(', '),
      city: deliveryAddress.area,
      country: 'Sri Lanka',
      hash,
    },
  };
}

export async function reconcilePayHereNotification(input: {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
  payment_id?: string;
}) {
  if (!env.PAYHERE_MERCHANT_ID || !env.PAYHERE_MERCHANT_SECRET) {
    throw new ProductServiceError('PayHere is not configured.', 503);
  }
  if (input.merchant_id !== env.PAYHERE_MERCHANT_ID) {
    throw new ProductServiceError('Invalid PayHere merchant.', 400);
  }

  const merchantSecretHash = md5(env.PAYHERE_MERCHANT_SECRET);
  const expectedHash = md5(
    `${input.merchant_id}${input.order_id}${input.payhere_amount}${input.payhere_currency}${input.status_code}${merchantSecretHash}`,
  );
  if (input.md5sig !== expectedHash) {
    throw new ProductServiceError('Invalid PayHere notification signature.', 400);
  }

  const order = await Order.findOne({ orderNumber: input.order_id }).exec();
  if (!order) throw new ProductServiceError('The PayHere order could not be found.', 404);
  if (order.paymentMethod !== 'payhere') {
    throw new ProductServiceError('This order does not use PayHere.', 400);
  }
  if (input.payhere_currency !== 'LKR' || Number(input.payhere_amount) !== order.totalLkr) {
    throw new ProductServiceError('PayHere notification amount or currency is invalid.', 409);
  }

  if (input.status_code === '2') {
    if (order.paymentStatus !== 'paid') {
      order.paymentStatus = 'paid';
      order.paymentPaidAt = new Date();
      if (input.payment_id) order.paymentReference = input.payment_id;
      await order.save();
    }
  } else if (input.status_code === '-3') {
    if (order.paymentStatus !== 'refunded') {
      order.paymentStatus = 'refunded';
      if (input.payment_id) order.paymentReference = input.payment_id;
      await order.save();
    }
  }

  return { reconciled: true };
}
