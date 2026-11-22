import { Router } from 'express';
import { ZodError } from 'zod';
import { getAdminContext, requireAdmin } from '../middleware/admin-auth.js';
import {
  cancelOrderSchema,
  listAdminOrdersQuerySchema,
  markCashReceivedSchema,
  orderNumberSchema,
  updateOrderStatusSchema,
} from '../schemas/admin-order.js';
import {
  cancelAdminOrder,
  listAdminOrders,
  markAdminOrderCashReceived,
  updateAdminOrderStatus,
} from '../services/admin-order.service.js';

export const adminOrdersRouter = Router();

adminOrdersRouter.use(requireAdmin);

adminOrdersRouter.get('/', async (req, res, next) => {
  try {
    const query = listAdminOrdersQuerySchema.parse(req.query);
    const result = await listAdminOrders(query);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid order list query.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

adminOrdersRouter.patch('/:orderNumber/status', async (req, res, next) => {
  try {
    const orderNumber = orderNumberSchema.parse(req.params.orderNumber);
    const input = updateOrderStatusSchema.parse(req.body);
    const order = await updateAdminOrderStatus(
      orderNumber,
      input.status,
      getAdminContext(res).actor.id,
    );
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid order status update.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

adminOrdersRouter.patch('/:orderNumber/cancel', async (req, res, next) => {
  try {
    const orderNumber = orderNumberSchema.parse(req.params.orderNumber);
    const input = cancelOrderSchema.parse(req.body);
    const order = await cancelAdminOrder(orderNumber, input.reason, getAdminContext(res).actor.id);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid order cancellation request.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

adminOrdersRouter.patch('/:orderNumber/payment-status', async (req, res, next) => {
  try {
    const orderNumber = orderNumberSchema.parse(req.params.orderNumber);
    markCashReceivedSchema.parse(req.body);
    const order = await markAdminOrderCashReceived(orderNumber, getAdminContext(res).actor.id);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid cash collection update.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});
