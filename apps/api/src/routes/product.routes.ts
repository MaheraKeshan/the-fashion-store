import { Router } from 'express';
import { ZodError } from 'zod';
import { getProductBySlug, listProducts } from '../services/product.service.js';
import { listProductsQuerySchema, productSlugParamsSchema } from '../schemas/product.js';

export const productRouter = Router();

productRouter.get('/', async (req, res, next) => {
  try {
    const query = listProductsQuerySchema.parse(req.query);
    const result = await listProducts(query);
    res.status(200).json({ success: true, data: result.products, pagination: result.pagination });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid product query parameters.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

productRouter.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = productSlugParamsSchema.parse(req.params);
    const product = await getProductBySlug(slug);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid product identifier.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});
