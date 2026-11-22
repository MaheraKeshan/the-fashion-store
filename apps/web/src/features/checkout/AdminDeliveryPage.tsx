import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDeliverySettings, saveFlatDeliverySettings } from './settingsApi';
import { AdminSignOutButton, useAdminAuth } from '../admin/AdminAuth';

export function AdminDeliveryPage() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAdminAuth();
  const [fee, setFee] = useState('');
  const [areasText, setAreasText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ['deliverySettings'],
    queryFn: fetchDeliverySettings,
  });
  const updateMutation = useMutation({
    mutationFn: (input: {
      deliveryFeeLkr: number;
      coveredAreas: string[];
      confirmedForProduction: boolean;
    }) =>
      saveFlatDeliverySettings(csrfToken, {
        pricingMethod: 'flat',
        ...input,
      }),
    onSuccess: async (settings) => {
      queryClient.setQueryData(['deliverySettings'], settings);
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setFee(String(settingsQuery.data.deliveryFeeLkr ?? ''));
    setAreasText(settingsQuery.data.coveredAreas.join('\n'));
    setConfirmed(settingsQuery.data.confirmedForProduction);
  }, [settingsQuery.data]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const coveredAreas = areasText
      .split(/\r?\n/)
      .map((area) => area.trim())
      .filter(Boolean);
    updateMutation.mutate({
      deliveryFeeLkr: Number(fee),
      coveredAreas,
      confirmedForProduction: confirmed,
    });
  };

  return (
    <main className="admin-delivery-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← THE FASHION STORE
        </Link>
        <nav className="admin-nav" aria-label="Administrator pages">
          <Link to="/admin/orders">ORDER MANAGEMENT</Link>
          <span className="admin-header-label">ADMIN · DELIVERY SETTINGS</span>
          <AdminSignOutButton />
        </nav>
      </header>

      <section className="admin-delivery-content">
        <p className="eyebrow">STORE CONFIGURATION</p>
        <h1>Delivery policy</h1>
        <p>
          Changes require your signed-in administrator session and a valid request security token.
        </p>

        {settingsQuery.isPending && (
          <p className="catalog-message" role="status">
            Loading current delivery settings…
          </p>
        )}
        {settingsQuery.isError && (
          <p className="catalog-filter-error" role="alert">
            {settingsQuery.error.message}
          </p>
        )}

        {settingsQuery.data && (
          <>
            <p
              className={
                settingsQuery.data.confirmedForProduction ? 'admin-confirmed' : 'admin-unconfirmed'
              }
              role="status"
            >
              {settingsQuery.data.confirmedForProduction
                ? 'Delivery settings are confirmed for order placement.'
                : 'Order placement remains disabled until these settings are confirmed.'}
            </p>
            {settingsQuery.data.pricingMethod !== 'flat' && (
              <p className="catalog-filter-error" role="alert">
                Current settings use area-based fees. This screen currently edits flat-rate settings
                only.
              </p>
            )}

            <form className="admin-delivery-form" onSubmit={handleSubmit}>
              <label>
                Flat delivery fee (LKR per order)
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  step="1"
                  required
                  value={fee}
                  onChange={(event) => {
                    setFee(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                Covered delivery areas <span>(one area per line)</span>
                <textarea
                  rows={12}
                  required
                  value={areasText}
                  onChange={(event) => {
                    setAreasText(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="admin-confirmation">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I confirm this fee and coverage are correct for production order placement.
                </span>
              </label>

              {updateMutation.isError && (
                <p className="catalog-filter-error" role="alert">
                  {updateMutation.error.message}
                </p>
              )}
              {updateMutation.isSuccess && (
                <p className="admin-confirmed" role="status">
                  Delivery settings saved.
                </p>
              )}
              <button
                className="cart-add-button"
                type="submit"
                disabled={updateMutation.isPending || settingsQuery.data.pricingMethod !== 'flat'}
              >
                {updateMutation.isPending ? 'SAVING…' : 'SAVE DELIVERY SETTINGS'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
