# The Fashion Store

Premium editorial fashion e-commerce platform for The Fashion Store – Bambalapitiya.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Database: MongoDB + Mongoose
- Architecture: npm workspaces monorepo

## Requirements

- Node.js 22 LTS or a newer supported LTS release
- npm
- MongoDB local instance or MongoDB Atlas connection string
- Redis 7 or compatible server for shared rate-limit counters

## Setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and replace the `MONGODB_URI` placeholder with your MongoDB Atlas connection string. In Atlas, create a database user and allow your development IP under Network Access. Keep `.env` private and never paste credentials into source code.
2. Start local Redis if it is not already running:

   ```bash
   docker run --name the-fashion-store-redis --restart unless-stopped -p 6379:6379 -d redis:7-alpine
   ```

   The example environment uses `redis://127.0.0.1:6379`. For production, configure a TLS-enabled Redis endpoint using a `rediss://` URL.

3. Development can start without MongoDB; database status will report disconnected. Production startup fails if MongoDB or Redis is unavailable.
4. From the repository root, run:

   ```bash
   npm install
   npm run dev:all
   ```

5. Open http://localhost:5173
6. Check the API at http://localhost:5000/api/v1/health

Use `npm run dev` for the frontend alone. To run the compiled backend, build it with `npm run build:api` and start it with `npm start`.

## Production readiness

- Production startup requires `MONGODB_URI`, an HTTPS `CLIENT_URL`, and `PASSWORD_RESET_WEBHOOK_URL`.
- Production startup requires `RATE_LIMIT_REDIS_URL` using `rediss://`; rate limits are shared across API instances.
- Production password-reset and PayHere notification webhook URLs must use HTTPS. The API exposes `/api/v1/health` for liveness and `/api/v1/health/ready` for readiness; readiness returns `503` until MongoDB is connected.
- Production startup also requires `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, and `PAYHERE_NOTIFY_URL`; set `PAYHERE_MODE=live` only after using sandbox credentials and testing the real redirect/webhook flow.
- Production MongoDB must be a replica set or Atlas deployment that supports transactions.
- Prepare Mongoose indexes explicitly before deployment:

  ```bash
  npm run db:indexes
  ```

  The command creates missing declared indexes and does not remove existing indexes.

## COD checkout setup

- COD order placement requires MongoDB transactions, so use MongoDB Atlas or another replica-set deployment. Standalone MongoDB servers can run the storefront but cannot place orders.
- Create the initial administrator using private one-time `ADMIN_INITIAL_EMAIL` and `ADMIN_INITIAL_PASSWORD` values in `apps/api/.env`. Use a unique password with at least 14 characters, then run `npm run admin:create --workspace=@fashion-store/api` and remove both bootstrap values from `.env`. The command refuses to run when an active admin already exists.
- The API initializes `StoreSettings` with the initial LKR 350 flat fee and configured coverage, but order placement remains disabled until an administrator reviews and confirms those settings at `/admin/delivery`.
- Admin sign-in is at `/admin/login`; delivery settings and order management are at `/admin/delivery` and `/admin/orders`. Sessions use an HTTP-only, SameSite cookie, CSRF tokens, an eight-hour expiry, and a five-attempt per-15-minute sign-in limit. Order tracking requires the order number and checkout phone, returns status only, and is limited to 10 attempts per 15 minutes per IP. Rate limits use Redis, are shared across API instances, and survive API restarts. Production cookies require HTTPS.
- COD and PayHere checkout are restricted to the configured storefront origin and limited to eight attempts per 15 minutes per IP.
- Account registration/login and password-reset requests/completion have per-IP limits. If Redis is unavailable, rate-limited endpoints fail closed; restore Redis availability before serving those operations.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies in front of the API, or leave it at `0`. Do not trust arbitrary forwarded headers.
- Privileged account, session, delivery-setting, order-status, cancellation and cash-collection changes are written to `admin_audit_events` in the same MongoDB transaction as the change. Admin session and audit operations therefore require a transaction-capable MongoDB replica set.
- Fulfillment statuses move forward in sequence. Unpaid PayHere orders cannot enter processing. Administrators may cancel unpaid pending or confirmed orders with a reason; the cancellation and stock restoration are atomic. COD cash can only be recorded as received after delivery. The store does not initiate refunds, but signed PayHere refund notifications are reconciled. Customer password resets are supported through the configured webhook. The bootstrap command only creates the first active admin; adding further admin accounts is not supported.

## Backend security and data handling

- Prices, delivery fees, stock, and payment state are recalculated or reconciled by the API; checkout totals sent by a browser are not trusted.
- Passwords use salted scrypt hashes. Session and password-reset tokens are stored as hashes; session cookies are HTTP-only and production cookies require HTTPS.
- Password reset delivery contains the customer's email and one-time reset token. Configure only a trusted HTTPS webhook endpoint; delivery failures are logged without logging tokens, email addresses, or webhook URLs.
- Order records contain customer contact and delivery details. Restrict database and backup access, encrypt backups at rest, and define retention/deletion practices appropriate to the store's privacy obligations before launch.
- Signed-in carts and wishlists are stored with the customer account; only product/variant identifiers and quantities are persisted. Include this data in account-deletion and retention procedures.
- `DELETE /api/v1/customer/auth/account` requires the current password, same-origin request, and CSRF token. It deletes the account, sessions, password-reset tokens, and saved items, and anonymizes personal fields on linked retained orders. Unlinked guest orders are not changed; handling them requires a verified ownership process. Age-based order deletion is not configured until the store's retention period is decided.
- Use a transaction-capable MongoDB deployment, trusted network access rules, least-privilege database credentials, and a tested backup restore process. Do not expose production secrets in logs or source control.
- The API applies bounded HTTP request timeouts and drains active requests on shutdown. Production error logs record only error types; use infrastructure-level monitoring for detailed diagnostics without capturing request bodies or credentials.

## Workspace commands

- `npm run dev` – run the frontend in Vite development mode
- `npm run dev:all` – run frontend and backend together
- `npm run dev:web` – run frontend only
- `npm run dev:api` – run backend only
- `npm run build:api` – compile the backend for production
- `npm start` – start the compiled backend (run `npm run build:api` first)
- `npm run build` – build both applications
- `npm run typecheck` – type-check both applications
- `npm run test` – run API unit and schema tests
- `npm run test:integration --workspace=@fashion-store/api` – run MongoDB replica-set order, stock, payment, and customer-session integration tests

## API endpoints

- `POST /api/v1/cart/quote` – recalculate shopping-bag prices and stock from MongoDB
- `GET /api/v1/store-settings/delivery` – read the current fee and coverage
- `GET /api/v1/health/ready` – report whether the API is ready to serve database-backed requests
- `POST /api/v1/admin/auth/login` – sign in and create a secure admin session
- `GET /api/v1/admin/auth/session` – validate the current admin session and obtain its CSRF token
- `POST /api/v1/admin/auth/logout` – revoke the current admin session
- `PATCH /api/v1/admin/store-settings/delivery` – update delivery settings with an admin session and CSRF token
- `POST /api/v1/orders` – place an idempotent Cash on Delivery order
- `POST /api/v1/orders/payhere/checkout` – create an order and signed PayHere hosted-checkout fields
- `POST /api/v1/payments/payhere/notify` – reconcile a signed PayHere server notification
- `POST /api/v1/orders/track` – retrieve minimal order status using the order number and checkout phone
- `POST /api/v1/customer/auth/register` – create a customer account and start an HTTP-only session
- `POST /api/v1/customer/auth/login` – sign in as a customer
- `GET /api/v1/customer/auth/session` – validate the current customer session
- `POST /api/v1/customer/auth/logout` – revoke the current customer session
- `GET /api/v1/customer/auth/orders` – retrieve the signed-in customer's cursor-paginated order history
- `GET /api/v1/customer/auth/cart` and `PUT /api/v1/customer/auth/cart` – retrieve or replace the signed-in customer's saved cart (`items` contain only `variantId` and `quantity`); prices and stock are recalculated by the API
- `GET /api/v1/customer/auth/wishlist` and `PUT /api/v1/customer/auth/wishlist` – retrieve or replace the signed-in customer's saved product wishlist using product IDs
- `PATCH /api/v1/customer/auth/profile` – update the signed-in customer's name and Sri Lankan mobile number
- `PATCH /api/v1/customer/auth/delivery-address` – save or update the signed-in customer's default delivery address
- `PATCH /api/v1/customer/auth/password` – change the signed-in customer's password and revoke other sessions
- `DELETE /api/v1/customer/auth/account` – delete the signed-in account after password confirmation and anonymize its linked retained orders
- `GET /api/v1/customer/auth/sessions` – list safe metadata for active customer sessions
- `POST /api/v1/customer/auth/sessions/revoke-others` – revoke every customer session except the current one
- `POST /api/v1/customer/auth/password-reset/request` – request a time-limited reset link without revealing whether an account exists
- `POST /api/v1/customer/auth/password-reset/complete` – consume a reset token, change the password, and revoke all sessions
- `GET /api/v1/admin/orders` – list private order details using a bounded cursor and admin session
- `PATCH /api/v1/admin/orders/:orderNumber/status` – advance an order through fulfillment stages with an admin session and CSRF token
- `PATCH /api/v1/admin/orders/:orderNumber/cancel` – cancel an unpaid pending or confirmed order with a reason and restore stock transactionally
- `PATCH /api/v1/admin/orders/:orderNumber/payment-status` – record COD cash as received only after delivery; refunds are not supported

## Importing products

Add verified categories, collections, products, and per-variant prices/stock to `apps/api/data/products.template.json`. Products reference taxonomy by slug in the file; include each referenced category and collection. The importer validates the entire file and runs as a dry run by default:

```bash
npm run import:products --workspace=@fashion-store/api -- --file data/products.template.json
```

After confirming the validation output, add `--apply` to upsert products by slug into the MongoDB database configured by `MONGODB_URI`:

```bash
npm run import:products --workspace=@fashion-store/api -- --file data/products.template.json --apply
```

Variant prices and compare-at prices are whole LKR amounts, and stock is per size/colour variant. Importing upserts matching slugs/SKUs and does not delete records omitted from the file. The importer may partially apply a file if a database write fails; review and retry the dry run before applying again.

## Project structure

```text
apps/
  web/    React storefront
  api/    Express API
packages/
  shared/ Shared contracts and schemas (future)
docs/     Architecture and product documentation (future)
```

## Important

Never commit real credentials. Keep `.env` files private. Payment credentials must only exist on the backend.
