import { Router } from 'express';
import { ZodError } from 'zod';
import { quoteCart } from '../services/cart.service.js';
import { cartQuoteRequestSchema } from '../schemas/cart.js';

export const cartRouter = Router();

cartRouter.post('/quote', async (req, res, next) => {
  try {
    const { items } = cartQuoteRequestSchema.parse(req.body);
    const quote = await quoteCart(items);
    res.status(200).json({ success: true, data: quote });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid shopping bag items.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});
