import { z } from 'zod';
import { API_URL } from '../catalog/productApi';

const deliverySettingsSchema = z.object({
  success: z.literal(true),
  data: z.object({
    currency: z.literal('LKR'),
    pricingMethod: z.enum(['flat', 'area-based']),
    deliveryFeeLkr: z.number().int().nonnegative().nullable(),
    deliveryAreaFees: z.array(
      z.object({
        area: z.string(),
        feeLkr: z.number().int().nonnegative(),
      }),
    ),
    coveredAreas: z.array(z.string()),
    confirmedForProduction: z.boolean(),
  }),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export type DeliverySettings = z.infer<typeof deliverySettingsSchema>['data'];

export interface FlatDeliverySettingsUpdate {
  pricingMethod: 'flat';
  deliveryFeeLkr: number;
  coveredAreas: string[];
  confirmedForProduction: boolean;
}

export async function fetchDeliverySettings() {
  const response = await fetch(`${API_URL}/store-settings/delivery`);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to load delivery settings (HTTP ${response.status}).`,
    );
  }

  const result = deliverySettingsSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('Delivery settings returned an invalid response.');
  }
  return result.data.data;
}

export async function saveFlatDeliverySettings(
  csrfToken: string,
  settings: FlatDeliverySettingsUpdate,
) {
  const response = await fetch(`${API_URL}/admin/store-settings/delivery`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(settings),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to update delivery settings (HTTP ${response.status}).`,
    );
  }

  const result = deliverySettingsSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('Updated delivery settings returned an invalid response.');
  }
  return result.data.data;
}
