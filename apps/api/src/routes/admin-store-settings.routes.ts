import { Router } from 'express';
import { ZodError } from 'zod';
import { requireAdmin } from '../middleware/admin-auth.js';
import { updateDeliverySettingsSchema } from '../schemas/store-settings.js';
import { updateDeliverySettings } from '../services/store-settings.service.js';
import { getAdminContext } from '../middleware/admin-auth.js';

export const adminStoreSettingsRouter = Router();

adminStoreSettingsRouter.use(requireAdmin);

adminStoreSettingsRouter.patch('/delivery', async (req, res, next) => {
  try {
    const input = updateDeliverySettingsSchema.parse(req.body);
    const settings = await updateDeliverySettings(input, getAdminContext(res).actor.id);
    res.status(200).json({
      success: true,
      data: {
        currency: settings.currency,
        pricingMethod: settings.deliveryPricingMethod,
        deliveryFeeLkr: settings.deliveryFeeLkr ?? null,
        deliveryAreaFees: settings.deliveryAreaFees,
        coveredAreas: settings.coveredAreas,
        confirmedForProduction: settings.deliveryConfirmed,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid delivery settings.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});
