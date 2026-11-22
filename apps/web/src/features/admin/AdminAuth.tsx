import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminAuthError, fetchAdminSession, logoutAdmin, type AdminSession } from './adminAuthApi';

interface AdminAuthContextValue extends AdminSession {
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminRouteGuard() {
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let expirationTimer: ReturnType<typeof setTimeout> | undefined;
    setError(undefined);
    fetchAdminSession(controller.signal)
      .then((activeSession) => {
        setSession(activeSession);
        expirationTimer = setTimeout(
          () => setSession(null),
          Math.max(0, Date.parse(activeSession.expiresAt) - Date.now()),
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        if (cause instanceof AdminAuthError && cause.status === 401) {
          setSession(null);
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Unable to verify administrator access.');
      });
    return () => {
      controller.abort();
      if (expirationTimer) clearTimeout(expirationTimer);
    };
  }, [retry]);

  if (error) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <p className="eyebrow">ADMINISTRATOR ACCESS</p>
          <h1>We could not verify your session.</h1>
          <p className="catalog-filter-error" role="alert">
            {error}
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            TRY AGAIN
          </button>
        </section>
      </main>
    );
  }
  if (session === undefined) {
    return (
      <main className="admin-login-page">
        <p role="status">Verifying administrator session…</p>
      </main>
    );
  }
  if (session === null) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  const signOut = async () => {
    await logoutAdmin(session.csrfToken);
  };
  return (
    <AdminAuthContext.Provider value={{ ...session, signOut }}>
      <Outlet />
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('Administrator pages require an authenticated admin session.');
  return context;
}

export function AdminSignOutButton() {
  const { signOut } = useAdminAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(undefined);
    try {
      await signOut();
      navigate('/admin/login', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
      setIsSigningOut(false);
    }
  };

  return (
    <>
      {error && (
        <span className="admin-signout-error" role="alert">
          {error}
        </span>
      )}
      <button
        className="admin-signout-button"
        type="button"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
      >
        {isSigningOut ? 'SIGNING OUT…' : 'SIGN OUT'}
      </button>
    </>
  );
}
