export type UserRole = 'customer' | 'admin';

export type PaymentMethod = 'COD' | 'ONLINE';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}