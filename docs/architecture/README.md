# Architecture notes

The application starts as a modular monolith in an npm-workspaces monorepo.

- `apps/web`: React customer storefront and future admin interface.
- `apps/api`: Express REST API.
- `packages/shared`: shared TypeScript contracts.
- API version prefix: `/api/v1`.
- Currency: LKR, represented as integer amounts in the smallest practical currency unit (whole rupees for this project).

Keep business logic in backend services, not route handlers. Never trust client-submitted prices, stock, roles or payment status.

## Product catalogue API

- `GET /api/v1/products` lists active products with an active category and active variants. It supports `gender` (`women`, `men`, `kids`, or `unisex`), `categoryId`, `collection` (slug), `size`, `color`, `q`, `minPrice`, `maxPrice`, `page`, `limit` (up to 100), and `sort` (`newest`, `price-asc`, or `price-desc`).
- `GET /api/v1/products/:slug` returns one active product.
- List responses contain `success`, `data`, and `pagination` (`page`, `limit`, `total`, and `totalPages`). Invalid query parameters return HTTP 400; catalogue requests without a MongoDB connection return HTTP 503.
- `Product` is stored in the existing `products` collection. It references one `Category` by `categoryId` and zero or more `Collection` records by `collectionIds`.
- `ProductVariant` is stored separately in `product_variants`. Its `price` and optional `compareAtPrice` are authoritative per-variant whole-LKR prices; products do not have a fallback price. `stockQuantity` belongs to the individual variant.
- Category hierarchy uses `parentId`; collection membership represents merchandising groups and does not duplicate products. Category/collection slugs and variant SKUs are unique. A case-insensitive compound unique index prevents duplicate size/colour pairs for one product.
- The catalog import script upserts taxonomy and product records by slug/SKU. It defaults to dry-run and never deletes omitted records. `--apply` can partially apply records if a later database write fails; transactional import is deferred until the inventory transaction phase.
- The storefront supports gender, collection, size, colour, price, search, and sort filters; product details load by slug and allow selecting an in-stock size/colour variant. It validates API responses with Zod and supports pagination. A wishlist is persisted in the browser by product slug and remains separate from the server-authoritative cart and order systems.
- PayHere hosted checkout is optional and server-authoritative. The API generates the PayHere checkout hash, order amount and notification URL; merchant credentials remain backend-only. Signed webhook notifications mark only matching PayHere orders paid or refunded. Sandbox and live endpoints are selected by `PAYHERE_MODE`.
- Customer accounts support public registration and sign-in through isolated HTTP-only, CSRF-protected sessions. Passwords use salted scrypt hashes. Existing guest orders are not automatically claimed or migrated.
- Signed-in COD checkout attaches the verified customer ID to newly created orders. Guest checkout remains supported, and existing or guest orders are not automatically claimed or migrated.
- Newly created COD orders store a canonical SHA-256 request fingerprint. Reusing an idempotency key for a changed checkout payload returns HTTP 409, while equivalent retries replay the original immutable summary. Existing orders without fingerprints remain replay-compatible for migration safety.
- COD placement requires the configured storefront origin and is process-rate-limited to eight attempts per 15 minutes per IP.
- Replica-set order integration coverage uses `mongodb-memory-server` and verifies concurrent idempotent retries create one order and decrement stock once. The competing-checkout case verifies only one of two concurrent orders consumes the final unit.
- `GET /api/v1/customer/auth/orders` returns a bounded, cursor-paginated customer-only order summary. The account page supports loading subsequent pages.
- `PATCH /api/v1/customer/auth/profile` updates the signed-in customer's name and optional Sri Lankan mobile number. Profile mutations require the same-origin restriction and customer-session CSRF protection.
- Customers may store one validated default delivery address. `PATCH /api/v1/customer/auth/delivery-address` updates it with CSRF protection, and checkout prefills it for signed-in users without changing guest behavior or stored order snapshots.
- Password changes verify the current password, replace the scrypt hash, and revoke all other customer sessions. Active-session metadata is available to the account page without exposing token hashes or CSRF secrets.
- Password-reset requests are enumeration-safe and rate limited. Reset tokens are random, hashed in MongoDB, expire after a configurable TTL, and are consumed with the password change. Completion revokes every customer session. Delivery requires `PASSWORD_RESET_WEBHOOK_URL`; the webhook receives `email`, `resetToken`, `expiresAt`, and `resetUrl`. No delivery provider or credentials are embedded in the frontend.
- No migration was run. Existing `products` fields/indexes are not dropped automatically; an explicit reviewed migration/index deployment is still required before production rollout.

## Shopping bag quote API

- The browser persists only variant IDs and quantities. `POST /api/v1/cart/quote` validates unique variant IDs and bounded quantities, then recalculates prices and availability from active database records.
- A quote does not reserve stock; order submission must revalidate stock and price transactionally.

## Store settings and COD orders

- `StoreSettings` stores the LKR currency, delivery pricing method, fee(s), covered areas, and an explicit production-confirmation flag. Initial values are LKR 350 flat-rate delivery and the configured Colombo-area coverage; confirmation defaults to false.
- `GET /api/v1/store-settings/delivery` exposes delivery settings for checkout. Admin sign-in uses `POST /api/v1/admin/auth/login`; authenticated browsers receive an eight-hour HTTP-only SameSite cookie and an in-memory synchronizer CSRF token. `GET /api/v1/admin/auth/session` validates a session, and `POST /api/v1/admin/auth/logout` revokes it.
- `PATCH /api/v1/admin/store-settings/delivery` and admin order operations require a valid session cookie; mutating requests additionally require `X-CSRF-Token`. Login attempts are rate limited per process, so multi-instance deployments need a shared rate-limit store. Configure `TRUST_PROXY_HOPS` only for the exact trusted reverse-proxy topology. Production cookies use the `__Host-` prefix and Secure attribute, so production admin traffic must use HTTPS.
- Bootstrap the first admin only through the private `ADMIN_INITIAL_EMAIL` and `ADMIN_INITIAL_PASSWORD` environment values and the `admin:create` CLI command. The CLI refuses to create another account once an active admin exists. Public registration is not available.
- `POST /api/v1/orders` accepts contact/address data and variant IDs/quantities only. It computes product and delivery charges from the database, stores immutable price/address snapshots, and decrements stock in a MongoDB transaction. Idempotency keys protect retries.
- COD order placement requires MongoDB replica-set transaction support. The order response contains only a random order number and non-personal confirmation details. `POST /api/v1/orders/track` verifies the order number and checkout phone, is rate limited, and returns only order status and timestamps.
- `GET /api/v1/admin/orders` requires an admin session and returns a bounded cursor page of order and customer details. `PATCH /api/v1/admin/orders/:orderNumber/status` allows only forward transitions from pending to confirmed, processing, shipped, and delivered.
- `PATCH /api/v1/admin/orders/:orderNumber/cancel` requires a reason and only cancels unpaid pending or confirmed orders. The status change, stock restoration for every line item, and cancellation audit event commit atomically; retries of an already-cancelled order do not restore stock again.
- `PATCH /api/v1/admin/orders/:orderNumber/payment-status` only accepts `paid`, and only for a delivered, unpaid COD order. It records an administrator's confirmation of cash collection; it does not integrate a payment provider or support refunds.
- `AdminAuditEvent` records account bootstrap, session creation/revocation, delivery-setting updates, order-status changes, cancellations, and cash collection. Business changes and corresponding audit records commit in one MongoDB transaction.
- There is currently one administrator role and no account-management, password-reset, or session-revocation UI. Keep database credentials private and verify production index deployment before rollout.
- Before production rollout, deploy/verify unique indexes for admin email/session token hashes, store settings key, order number, and order idempotency key. Production order placement also requires an initialized admin account and explicitly confirmed delivery settings.
