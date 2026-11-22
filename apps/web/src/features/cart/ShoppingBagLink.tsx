import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCartStore } from './cartStore';

export function ShoppingBagLink() {
  const itemCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0),
  );

  return (
    <Link
      className="icon-button bag-link"
      to="/bag"
      aria-label={`Shopping bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
    >
      <ShoppingBag />
      {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
    </Link>
  );
}
