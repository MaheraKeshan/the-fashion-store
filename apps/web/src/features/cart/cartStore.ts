import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  variantId: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
}

const maximumQuantity = 99;

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      addItem: (variantId) =>
        set((state) => {
          const existingItem = state.items.find((item) => item.variantId === variantId);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.variantId === variantId
                  ? { ...item, quantity: Math.min(item.quantity + 1, maximumQuantity) }
                  : item,
              ),
            };
          }
          return { items: [...state.items, { variantId, quantity: 1 }] };
        }),
      setQuantity: (variantId, quantity) => {
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximumQuantity) {
          throw new RangeError(`Cart quantity must be between 1 and ${maximumQuantity}.`);
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.variantId === variantId ? { ...item, quantity } : item,
          ),
        }));
      },
      removeItem: (variantId) =>
        set((state) => ({
          items: state.items.filter((item) => item.variantId !== variantId),
        })),
      clearCart: () => set({ items: [] }),
    }),
    { name: 'the-fashion-store-cart', version: 1 },
  ),
);
