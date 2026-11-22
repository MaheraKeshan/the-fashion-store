import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginAdmin } from './adminAuthApi';

interface LoginLocationState {
  from?: string;
}

export function AdminLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationState = location.state as LoginLocationState | null;
  const destination =
    locationState?.from?.startsWith('/admin/') && locationState.from !== '/admin/login'
      ? locationState.from
      : '/admin/orders';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      await loginAdmin(email, password);
      setPassword('');
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <header className="product-detail-header">
        <Link className="product-detail-back" to="/">
          ← THE FASHION STORE
        </Link>
        <span className="admin-header-label">SECURE ADMINISTRATION</span>
      </header>
      <section className="admin-login-card">
        <p className="eyebrow">ADMINISTRATOR ACCESS</p>
        <h1>Sign in</h1>
        <p className="admin-login-intro">
          Sign in with an administrator account to manage store operations.
        </p>
        <form className="admin-login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="catalog-filter-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'SIGNING IN…' : 'SIGN IN'}
          </button>
        </form>
      </section>
    </main>
  );
}
