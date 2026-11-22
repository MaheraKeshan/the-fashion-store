import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WishlistStore {
  slugs: string[];
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  has: (slug: string) => boolean;
}

const maximumWishlistItems = 100;

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      slugs: [],
      toggle: (slug) =>
        set((state) => ({
          slugs: state.slugs.includes(slug)
            ? state.slugs.filter((savedSlug) => savedSlug !== slug)
            : [...state.slugs, slug].slice(-maximumWishlistItems),
        })),
      remove: (slug) =>
        set((state) => ({
          slugs: state.slugs.filter((savedSlug) => savedSlug !== slug),
        })),
      has: (slug) => get().slugs.includes(slug),
    }),
    { name: 'the-fashion-store-wishlist', version: 1 },
  ),
);
