import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CustomerAuthError,
  fetchCustomerSession,
  fetchCustomerOrders,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  updateCustomerProfile,
  updateCustomerDeliveryAddress,
  changeCustomerPassword,
  fetchCustomerSessions,
  revokeOtherCustomerSessions,
  requestCustomerPasswordReset,
  completeCustomerPasswordReset,
  type CustomerSession,
  type CustomerOrder,
  type CustomerSessionSummary,
} from './customerAuthApi';

const priceFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
});

export function AccountPage() {
  const [session, setSession] = useState<CustomerSession | null>();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEditing, setProfileEditing] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressArea, setAddressArea] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressInstructions, setAddressInstructions] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<CustomerSessionSummary[]>([]);
  const [resetEmail, setResetEmail] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const resetToken =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') ?? ''
      : '';

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomerSession(controller.signal)
      .then((activeSession) => {
        setSession(activeSession);
        setProfileName(activeSession.user.name);
        setProfilePhone(activeSession.user.phone ?? '');
        setAddressLine1(activeSession.user.deliveryAddress?.line1 ?? '');
        setAddressLine2(activeSession.user.deliveryAddress?.line2 ?? '');
        setAddressArea(activeSession.user.deliveryAddress?.area ?? '');
        setAddressPostalCode(activeSession.user.deliveryAddress?.postalCode ?? '');
        setAddressInstructions(activeSession.user.deliveryAddress?.instructions ?? '');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        if (cause instanceof CustomerAuthError && cause.status === 401) setSession(null);
        else setError(cause instanceof Error ? cause.message : 'Unable to verify your account.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session) {
      setOrders([]);
      setNextCursor(undefined);
      setSessions([]);
      return;
    }
    setOrdersLoading(true);
    fetchCustomerOrders()
      .then((page) => {
        setOrders(page.data);
        setNextCursor(page.pagination.nextCursor);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load your orders.');
      })
      .finally(() => setOrdersLoading(false));
  }, [session?.csrfToken]);

  useEffect(() => {
    if (!session) return;
    fetchCustomerSessions()
      .then(setSessions)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load account sessions.');
      });
  }, [session?.csrfToken]);

  const loadMoreOrders = async () => {
    if (!nextCursor) return;
    setOrdersLoading(true);
    try {
      const page = await fetchCustomerOrders(nextCursor);
      setOrders((current) => [...current, ...page.data]);
      setNextCursor(page.pagination.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load more orders.');
    } finally {
      setOrdersLoading(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      const user = await updateCustomerProfile(
        session.csrfToken,
        profileName,
        profilePhone,
      );
      setSession({
        ...session,
        user,
      });
      setProfileEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      const user = await updateCustomerDeliveryAddress(session.csrfToken, {
        line1: addressLine1,
        ...(addressLine2 && { line2: addressLine2 }),
        area: addressArea,
        ...(addressPostalCode && { postalCode: addressPostalCode }),
        ...(addressInstructions && { instructions: addressInstructions }),
      });
      setSession({ ...session, user });
      setAddressEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your delivery address.');
    } finally {
      setSubmitting(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      await changeCustomerPassword(
        session.csrfToken,
        currentPassword,
        newPassword,
      );
      setCurrentPassword('');
      setNewPassword('');
      setSessions((current) => current.filter((item) => item.isCurrent));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change your password.');
    } finally {
      setSubmitting(false);
    }
  };

  const revokeOthers = async () => {
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      await revokeOtherCustomerSessions(session.csrfToken);
      setSessions((current) => current.filter((item) => item.isCurrent));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke other sessions.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const activeSession =
        mode === 'register'
          ? await registerCustomer(name, email, password)
          : await loginCustomer(email, password);
      setSession(activeSession);
      setProfileName(activeSession.user.name);
      setProfilePhone(activeSession.user.phone ?? '');
      setAddressLine1(activeSession.user.deliveryAddress?.line1 ?? '');
      setAddressLine2(activeSession.user.deliveryAddress?.line2 ?? '');
      setAddressArea(activeSession.user.deliveryAddress?.area ?? '');
      setAddressPostalCode(activeSession.user.deliveryAddress?.postalCode ?? '');
      setAddressInstructions(activeSession.user.deliveryAddress?.instructions ?? '');
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue.');
      setSubmitting(false);
    }
  };

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await requestCustomerPasswordReset(resetEmail);
      setResetRequested(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request a reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const completeReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await completeCustomerPasswordReset(resetToken, resetPassword);
      setResetPassword('');
      setMode('login');
      globalThis.history.replaceState({}, '', '/account');
      setError('Password reset complete. Please sign in.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete the reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      await logoutCustomer(session.csrfToken);
      setSession(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="wordmark" to="/" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </Link>
        <Link className="product-detail-back" to="/">
          CONTINUE SHOPPING →
        </Link>
      </header>
      <section className="account-card">
        {session === undefined ? (
          <p role="status">Verifying your account…</p>
        ) : session ? (
          <>
            <p className="eyebrow">MY ACCOUNT</p>
            <h1>Welcome, {session.user.name}.</h1>
            <p className="account-email">{session.user.email}</p>
            {profileEditing ? (
              <form className="account-profile-form" onSubmit={(event) => void saveProfile(event)}>
                <label>
                  <span>NAME</span>
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  <span>MOBILE NUMBER</span>
                  <input
                    value={profilePhone}
                    onChange={(event) => setProfilePhone(event.target.value)}
                    placeholder="077 123 4567"
                    maxLength={20}
                  />
                </label>
                <div className="account-profile-actions">
                  <button className="primary-button" type="submit" disabled={submitting}>
                    {submitting ? 'SAVING…' : 'SAVE PROFILE'}
                  </button>
                  <button
                    className="account-secondary-button"
                    type="button"
                    onClick={() => {
                      setProfileName(session.user.name);
                      setProfilePhone(session.user.phone ?? '');
                      setProfileEditing(false);
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            ) : (
              <div className="account-profile-summary">
                {session.user.phone && <p>Mobile: {session.user.phone}</p>}
                <button
                  className="account-edit-button"
                  type="button"
                  onClick={() => setProfileEditing(true)}
                >
                  EDIT PROFILE
                </button>
              </div>
            )}
            <section className="account-address" aria-labelledby="account-address-heading">
              <div className="account-section-heading">
                <h2 id="account-address-heading">Default delivery address</h2>
                {!addressEditing && (
                  <button
                    className="account-edit-button"
                    type="button"
                    onClick={() => setAddressEditing(true)}
                  >
                    {session.user.deliveryAddress ? 'EDIT ADDRESS' : 'ADD ADDRESS'}
                  </button>
                )}
              </div>
              {addressEditing ? (
                <form className="account-profile-form" onSubmit={(event) => void saveAddress(event)}>
                  <label>
                    <span>ADDRESS LINE 1</span>
                    <input
                      value={addressLine1}
                      onChange={(event) => setAddressLine1(event.target.value)}
                      minLength={5}
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    <span>ADDRESS LINE 2</span>
                    <input
                      value={addressLine2}
                      onChange={(event) => setAddressLine2(event.target.value)}
                      maxLength={200}
                    />
                  </label>
                  <label>
                    <span>DELIVERY AREA</span>
                    <input
                      value={addressArea}
                      onChange={(event) => setAddressArea(event.target.value)}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    <span>POSTAL CODE</span>
                    <input
                      value={addressPostalCode}
                      onChange={(event) => setAddressPostalCode(event.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]{5}"
                      maxLength={5}
                    />
                  </label>
                  <label>
                    <span>DELIVERY INSTRUCTIONS</span>
                    <input
                      value={addressInstructions}
                      onChange={(event) => setAddressInstructions(event.target.value)}
                      maxLength={300}
                    />
                  </label>
                  <div className="account-profile-actions">
                    <button className="primary-button" type="submit" disabled={submitting}>
                      {submitting ? 'SAVING…' : 'SAVE ADDRESS'}
                    </button>
                    <button
                      className="account-secondary-button"
                      type="button"
                      onClick={() => setAddressEditing(false)}
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              ) : (
                <p className="account-address-summary">
                  {session.user.deliveryAddress
                    ? `${session.user.deliveryAddress.line1}${session.user.deliveryAddress.line2 ? `, ${session.user.deliveryAddress.line2}` : ''}, ${session.user.deliveryAddress.area}`
                    : 'No default address saved.'}
                </p>
              )}
            </section>
            <section className="account-security" aria-labelledby="account-security-heading">
              <h2 id="account-security-heading">Security</h2>
              <form className="account-profile-form" onSubmit={(event) => void savePassword(event)}>
                <label>
                  <span>CURRENT PASSWORD</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    minLength={1}
                    maxLength={128}
                    required
                  />
                </label>
                <label>
                  <span>NEW PASSWORD</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? 'UPDATING…' : 'CHANGE PASSWORD'}
                </button>
              </form>
              <div className="account-sessions">
                <div className="account-section-heading">
                  <h3>Active sessions</h3>
                  {sessions.some((item) => !item.isCurrent) && (
                    <button
                      className="account-edit-button"
                      type="button"
                      disabled={submitting}
                      onClick={() => void revokeOthers()}
                    >
                      REVOKE OTHER SESSIONS
                    </button>
                  )}
                </div>
                {sessions.map((item) => (
                  <p className="account-session" key={item.id}>
                    <span>{item.isCurrent ? 'CURRENT SESSION' : 'OTHER SESSION'}</span>
                    <span>Expires {new Date(item.expiresAt).toLocaleString('en-LK')}</span>
                  </p>
                ))}
              </div>
            </section>
            <div className="account-actions">
              <Link className="primary-button" to="/track-order">TRACK AN ORDER</Link>
              <Link className="account-secondary-button" to="/wishlist">VIEW WISHLIST</Link>
              <button
                className="account-secondary-button"
                type="button"
                disabled={submitting}
                onClick={() => void signOut()}
              >
                {submitting ? 'SIGNING OUT…' : 'SIGN OUT'}
              </button>
            </div>
            <section className="account-orders" aria-labelledby="account-orders-heading">
              <h2 id="account-orders-heading">Order history</h2>
              {ordersLoading && orders.length === 0 ? (
                <p role="status">Loading your orders…</p>
              ) : orders.length === 0 ? (
                <p>Your account is ready. New orders placed while signed in will appear here.</p>
              ) : (
                <>
                  {orders.map((order) => (
                    <article className="account-order" key={order.orderNumber}>
                      <div>
                        <span>ORDER</span>
                        <strong>{order.orderNumber}</strong>
                      </div>
                      <div>
                        <span>STATUS</span>
                        <strong>{order.status.toUpperCase()}</strong>
                      </div>
                      <div>
                        <span>TOTAL</span>
                        <strong>{priceFormatter.format(order.totalLkr)}</strong>
                      </div>
                      <div>
                        <span>PLACED</span>
                        <strong>{new Date(order.createdAt).toLocaleDateString('en-LK')}</strong>
                      </div>
                      <Link
                        className="text-link"
                        to={`/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}`}
                      >
                        TRACK
                      </Link>
                    </article>
                  ))}
                  {nextCursor && (
                    <button
                      className="account-load-orders"
                      type="button"
                      disabled={ordersLoading}
                      onClick={() => void loadMoreOrders()}
                    >
                      {ordersLoading ? 'LOADING…' : 'LOAD MORE'}
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <p className="eyebrow">MY ACCOUNT</p>
            <h1>
              {resetToken
                ? 'Reset your password.'
                : mode === 'login'
                  ? 'Sign in.'
                  : 'Create an account.'}
            </h1>
            {resetToken ? (
              <form className="account-form" onSubmit={(event) => void completeReset(event)}>
                <label>
                  <span>NEW PASSWORD</span>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
                {error && <p className="account-error" role="alert">{error}</p>}
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? 'RESETTING…' : 'RESET PASSWORD'}
                </button>
              </form>
            ) : (
              <>
            <div className="account-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => setMode('login')}
              >
                SIGN IN
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => setMode('register')}
              >
                REGISTER
              </button>
            </div>
            <form className="account-form" onSubmit={(event) => void submit(event)}>
              {mode === 'register' && (
                <label>
                  <span>NAME</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required />
                </label>
              )}
              <label>
                <span>EMAIL</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
              </label>
              <label>
                <span>PASSWORD</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 10 : 1} maxLength={128} required />
              </label>
              {error && <p className="account-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>
            </form>
            {mode === 'login' && (
              <form className="account-reset-request" onSubmit={(event) => void requestReset(event)}>
                <label>
                  <span>FORGOT YOUR PASSWORD?</span>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="Email address"
                    maxLength={254}
                    required
                  />
                </label>
                <button className="account-edit-button" type="submit" disabled={submitting}>
                  SEND RESET LINK
                </button>
                {resetRequested && (
                  <p role="status">
                    If an account exists for that email, reset instructions will be sent.
                  </p>
                )}
              </form>
            )}
              </>
            )}
          </>
        )}
        {session && error && <p className="account-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
