import { Heart } from 'lucide-react';
import { useWishlistStore } from './wishlistStore';

interface WishlistButtonProps {
  slug: string;
  name: string;
  className?: string;
}

export function WishlistButton({ slug, name, className = '' }: WishlistButtonProps) {
  const saved = useWishlistStore((state) => state.slugs.includes(slug));
  const toggle = useWishlistStore((state) => state.toggle);

  return (
    <button
      className={`wishlist-button ${saved ? 'wishlist-button-active' : ''} ${className}`.trim()}
      type="button"
      aria-label={`${saved ? 'Remove' : 'Add'} ${name} ${saved ? 'from' : 'to'} wishlist`}
      aria-pressed={saved}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(slug);
      }}
    >
      <Heart fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
