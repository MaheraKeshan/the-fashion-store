import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Menu, Search, UserRound, X } from 'lucide-react';
import { Route, Routes, Link } from 'react-router-dom';
import { ProductCatalog } from './features/catalog/ProductCatalog';
import { ProductDetailPage } from './features/catalog/ProductDetailPage';
import { CartPage } from './features/cart/CartPage';
import { ShoppingBagLink } from './features/cart/ShoppingBagLink';
import { CheckoutPage } from './features/checkout/CheckoutPage';
import { OrderTrackingPage } from './features/checkout/OrderTrackingPage';
import { AdminDeliveryPage } from './features/checkout/AdminDeliveryPage';
import { AdminOrdersPage } from './features/checkout/AdminOrdersPage';
import { AdminRouteGuard } from './features/admin/AdminAuth';
import { AdminLoginPage } from './features/admin/AdminLoginPage';
import { API_URL, type ProductGender } from './features/catalog/productApi';
import { WishlistPage } from './features/wishlist/WishlistPage';
import { AccountPage } from './features/account/AccountPage';

type ApiHealth = {
  status: string;
  service: string;
  database: string;
};

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [dbStatus, setDbStatus] = useState('Checking');
  const [gender, setGender] = useState<ProductGender>();
  const [isPlusSize, setIsPlusSize] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error('API unavailable');
        return (await response.json()) as ApiHealth;
      })
      .then((data) => {
        if (!active) return;
        setApiStatus('online');
        setDbStatus(data.database);
      })
      .catch(() => {
        if (active) setApiStatus('offline');
      });
    return () => {
      active = false;
    };
  }, []);

  const selectGender = (nextGender: ProductGender) => {
    setGender(nextGender);
    setIsPlusSize(false);
    setMenuOpen(false);
  };

  const selectPlusSize = () => {
    setGender(undefined);
    setIsPlusSize(true);
    setMenuOpen(false);
  };

  return (
    <main>
      <div className="announcement">
        <span>THE NEW SEASON, CONSIDERED.</span>
        <span className="announcement-right">
          DISCOVER THE COLLECTION <ArrowRight size={12} />
        </span>
      </div>

      <header className="site-header">
        <button
          className="icon-button mobile-menu"
          aria-label="Open menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={`nav-left ${menuOpen ? 'nav-open' : ''}`}>
          <a href="#new-arrivals" onClick={() => selectGender('women')}>
            WOMEN
          </a>
          <a href="#new-arrivals" onClick={() => selectGender('men')}>
            MEN
          </a>
          <a href="#new-arrivals" onClick={() => selectGender('kids')}>
            KIDS
          </a>
          <a href="#new-arrivals" onClick={selectPlusSize}>
            PLUS SIZE
          </a>
        </nav>
        <a className="wordmark" href="#" aria-label="The Fashion Store home">
          <span>THE FASHION STORE</span>
          <small>BAMBALAPITIYA · COLOMBO</small>
        </a>
        <div className="nav-right">
          <button
            className="icon-button"
            aria-label="Search products"
            onClick={() => {
              document.getElementById('new-arrivals')?.scrollIntoView({ behavior: 'smooth' });
              window.setTimeout(() => document.getElementById('catalog-search')?.focus(), 350);
            }}
          >
            <Search />
          </button>
          <Link className="icon-button account-button" to="/account" aria-label="Customer account">
            <UserRound />
          </Link>
          <Link className="icon-button" to="/wishlist" aria-label="Wishlist">
            <Heart />
          </Link>
          <ShoppingBagLink />
        </div>
      </header>

      <section className="hero">
        <img
          className="hero-image"
          src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=2200&q=85"
          alt="Contemporary fashion editorial campaign"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">A NEW PERSPECTIVE ON EVERYDAY STYLE</p>
          <h1>
            Style that
            <br />
            <em>speaks.</em>
          </h1>
          <p className="hero-copy">
            Thoughtful everyday fashion.
            <br />
            Made to move with you.
          </p>
          <a className="primary-button" href="#new-arrivals">
            EXPLORE THE COLLECTION <ArrowRight size={15} />
          </a>
        </div>
        <div className="hero-index">
          <span>01</span>
          <span className="index-line" />
          <span>03</span>
        </div>
        <p className="hero-caption">THE EVERYDAY EDIT — 2026</p>
      </section>

      <section className="intro-section">
        <p className="eyebrow">THE FASHION STORE · COLOMBO</p>
        <h2>
          Good style should feel
          <br />
          <em>like your own.</em>
        </h2>
        <p>Discover considered everyday pieces, fresh essentials and styles for every shape.</p>
      </section>

      <section className="category-section" id="collections">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR POINT OF VIEW</p>
            <h2>Explore the collections</h2>
          </div>
          <a href="#new-arrivals" className="text-link">
            VIEW ALL <ArrowRight size={14} />
          </a>
        </div>
        <div className="category-grid">
          <a className="category-card" href="#new-arrivals" onClick={() => selectGender('women')}>
            <img
              src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1000&q=85"
              alt="Women's collection"
            />
            <span>01 / WOMEN</span>
            <strong>Everyday, elevated.</strong>
          </a>
          <a className="category-card" href="#new-arrivals" onClick={() => selectGender('men')}>
            <img
              src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=85"
              alt="Contemporary fashion collection"
            />
            <span>02 / MEN</span>
            <strong>Made for your rhythm.</strong>
          </a>
          <a className="category-card" href="#new-arrivals" onClick={() => selectGender('kids')}>
            <img
              src="https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=1000&q=85"
              alt="Kids fashion collection"
            />
            <span>03 / KIDS</span>
            <strong>Little moments, big style.</strong>
          </a>
        </div>
      </section>

      <section className="new-arrivals" id="new-arrivals">
        <div className="section-heading">
          <div>
            <p className="eyebrow">JUST LANDED</p>
            <h2>The new edit</h2>
          </div>
          <a
            href="#new-arrivals"
            className="text-link"
            onClick={() => {
              setGender(undefined);
              setIsPlusSize(false);
            }}
          >
            VIEW ALL <ArrowRight size={14} />
          </a>
        </div>
        <ProductCatalog
          gender={gender}
          isPlusSize={isPlusSize}
          onGenderChange={setGender}
          onPlusSizeChange={setIsPlusSize}
        />
      </section>

      <section className="inclusive-section" id="plus-size">
        <img
          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1800&q=85"
          alt="Inclusive contemporary fashion editorial"
        />
        <div className="inclusive-overlay" />
        <div className="inclusive-content">
          <p className="eyebrow">STYLE WITHOUT LIMITS</p>
          <h2>
            Fashion for
            <br />
            <em>every body.</em>
          </h2>
          <p>More choice. More confidence. Your style, your way.</p>
          <a href="#new-arrivals" className="light-button" onClick={selectPlusSize}>
            EXPLORE PLUS SIZE <ArrowRight size={15} />
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-top">
          <div>
            <a className="footer-wordmark" href="#">
              THE FASHION STORE
            </a>
            <p>Everyday fashion, thoughtfully found.</p>
          </div>
          <div className="footer-links">
            <a href="#collections">COLLECTIONS</a>
            <a href="#new-arrivals">NEW ARRIVALS</a>
            <a href="#plus-size">PLUS SIZE</a>
            <Link to="/track-order">TRACK ORDER</Link>
          </div>
          <div className="footer-links">
            <span>VISIT US</span>
            <span>BAMBALAPITIYA, COLOMBO</span>
            <span>SRI LANKA</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 THE FASHION STORE</span>
          <span>MADE FOR EVERYDAY LIVING.</span>
        </div>
        <div className="dev-status">
          <span>DEVELOPMENT STATUS</span>
          <span
            className={
              apiStatus === 'online' ? 'status-ok' : apiStatus === 'offline' ? 'status-error' : ''
            }
          >
            API: {apiStatus.toUpperCase()}
          </span>
          <span>DATABASE: {dbStatus.toUpperCase()}</span>
        </div>
      </footer>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="product-detail-page">
      <div className="product-detail-message">
        <p className="eyebrow">404 · PAGE NOT FOUND</p>
        <h1>We could not find that page.</h1>
        <Link className="text-link" to="/">
          RETURN TO THE COLLECTION
        </Link>
      </div>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products/:slug" element={<ProductDetailPage />} />
      <Route path="/bag" element={<CartPage />} />
      <Route path="/wishlist" element={<WishlistPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/track-order" element={<OrderTrackingPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminRouteGuard />}>
        <Route path="/admin/delivery" element={<AdminDeliveryPage />} />
        <Route path="/admin/orders" element={<AdminOrdersPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
