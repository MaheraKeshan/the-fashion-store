import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { Order } from '../models/order.js';
import { ProductServiceError } from './product.service.js';

export interface PayHereCheckout {
  actionUrl: string;
  fields: Record<string, string>;
}

export function assertPayHereConfigured(
  configuration: Pick<typeof env, 'PAYHERE_MERCHANT_ID' | 'PAYHERE_MERCHANT_SECRET'> = env,
) {
  const merchantId = configuration.PAYHERE_MERCHANT_ID;
  const merchantSecret = configuration.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !merchantSecret) {
    throw new ProductServiceError(
      'PayHere is not configured. Online payment is temporarily unavailable.',
      503,
    );
  }
  return { merchantId, merchantSecret };
}

export function assertPayHereOrderPayable(order: { status: string; paymentStatus: string }) {
  if (
    order.paymentStatus !== 'unpaid' ||
    (order.status !== 'pending' && order.status !== 'confirmed')
  ) {
    throw new ProductServiceError('This order is no longer available for payment.', 409);
  }
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
  const { merchantId, merchantSecret } = assertPayHereConfigured();

  const amount = order.totalLkr.toFixed(2);
  const merchantSecretHash = md5(merchantSecret);
  const hash = md5(`${merchantId}${order.orderNumber}${amount}LKR${merchantSecretHash}`);

  return {
    actionUrl:
      env.PAYHERE_MODE === 'live'
        ? 'https://www.payhere.lk/pay/checkout'
        : 'https://sandbox.payhere.lk/pay/checkout',
    fields: {
      merchant_id: merchantId,
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
  const { merchantId, merchantSecret } = assertPayHereConfigured();
  if (input.merchant_id !== merchantId) {
    throw new ProductServiceError('Invalid PayHere merchant.', 400);
  }

  const merchantSecretHash = md5(merchantSecret);
  const expectedHash = md5(
    `${input.merchant_id}${input.order_id}${input.payhere_amount}${input.payhere_currency}${input.status_code}${merchantSecretHash}`,
  );
  const suppliedSignature = Buffer.from(input.md5sig, 'hex');
  const expectedSignature = Buffer.from(expectedHash, 'hex');
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new ProductServiceError('Invalid PayHere notification signature.', 400);
  }

  const order = await Order.findOne({ orderNumber: input.order_id }).exec();
  if (!order) throw new ProductServiceError('The PayHere order could not be found.', 404);
  if (order.paymentMethod !== 'payhere') {
    throw new ProductServiceError('This order does not use PayHere.', 400);
  }
  if (input.payhere_currency !== 'LKR' || input.payhere_amount !== order.totalLkr.toFixed(2)) {
    throw new ProductServiceError('PayHere notification amount or currency is invalid.', 409);
  }

  if (input.status_code === '2') {
    if (order.paymentStatus === 'refunded') {
      throw new ProductServiceError('A refunded PayHere payment cannot be marked paid.', 409);
    }
    if (order.paymentStatus === 'unpaid') {
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: 'unpaid' },
        {
          $set: {
            paymentStatus: 'paid',
            paymentPaidAt: new Date(),
            ...(input.payment_id && { paymentReference: input.payment_id }),
          },
        },
        { new: true, runValidators: true },
      )
        .lean()
        .exec();
      if (!updated) {
        const latestOrder = await Order.findById(order._id).select('paymentStatus').lean().exec();
        if (latestOrder?.paymentStatus !== 'paid') {
          throw new ProductServiceError('The PayHere payment status changed unexpectedly.', 409);
        }
      }
    }
  } else if (input.status_code === '-3') {
    if (order.paymentStatus === 'unpaid') {
      throw new ProductServiceError('An unpaid PayHere order cannot be marked refunded.', 409);
    }
    if (order.paymentStatus === 'paid') {
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: 'paid' },
        {
          $set: {
            paymentStatus: 'refunded',
            ...(input.payment_id && { paymentReference: input.payment_id }),
          },
        },
        { new: true, runValidators: true },
      )
        .lean()
        .exec();
      if (!updated) {
        const latestOrder = await Order.findById(order._id).select('paymentStatus').lean().exec();
        if (latestOrder?.paymentStatus !== 'refunded') {
          throw new ProductServiceError('The PayHere payment status changed unexpectedly.', 409);
        }
      }
    }
  }

  return { reconciled: true };
}
