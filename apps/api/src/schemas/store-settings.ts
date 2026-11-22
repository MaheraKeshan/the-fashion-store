import { z } from 'zod';

const areaSchema = z.string().trim().min(2).max(100);
const coveredAreasSchema = z
  .array(areaSchema)
  .min(1)
  .max(100)
  .refine(
    (areas) => new Set(areas.map((area) => area.toLocaleLowerCase('en'))).size === areas.length,
    { message: 'Delivery areas must be unique.' },
  );
const feeSchema = z.number().int().min(0).max(10_000_000);

export const updateDeliverySettingsSchema = z
  .discriminatedUnion('pricingMethod', [
    z
      .object({
        pricingMethod: z.literal('flat'),
        deliveryFeeLkr: feeSchema,
        coveredAreas: coveredAreasSchema,
        confirmedForProduction: z.boolean(),
      })
      .strict(),
    z
      .object({
        pricingMethod: z.literal('area-based'),
        deliveryAreaFees: z
          .array(z.object({ area: areaSchema, feeLkr: feeSchema }).strict())
          .min(1)
          .max(100),
        coveredAreas: coveredAreasSchema,
        confirmedForProduction: z.boolean(),
      })
      .strict(),
  ])
  .superRefine((settings, context) => {
    if (settings.pricingMethod !== 'area-based') return;

    const feeAreas = new Set(
      settings.deliveryAreaFees.map((entry) => entry.area.toLocaleLowerCase('en')),
    );
    if (
      feeAreas.size !== settings.deliveryAreaFees.length ||
      feeAreas.size !== settings.coveredAreas.length ||
      settings.coveredAreas.some((area) => !feeAreas.has(area.toLocaleLowerCase('en')))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Area-based pricing must define exactly one fee for each covered area.',
        path: ['deliveryAreaFees'],
      });
    }
  });

export type UpdateDeliverySettings = z.infer<typeof updateDeliverySettingsSchema>;
