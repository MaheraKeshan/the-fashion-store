import { Router } from 'express';
import { getStoreSettings } from '../services/store-settings.service.js';

export const storeSettingsRouter = Router();

storeSettingsRouter.get('/delivery', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
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
    next(error);
  }
});
