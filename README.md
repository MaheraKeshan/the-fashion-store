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

## Setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and replace the `MONGODB_URI` placeholder with your MongoDB Atlas connection string. In Atlas, create a database user and allow your development IP under Network Access. Keep `.env` private and never paste credentials into source code.
2. The API can start without MongoDB; database status will report disconnected.
3. From the repository root, run:

   ```bash
   npm install
   npm run dev:all
   ```

4. Open http://localhost:5173
5. Check the API at http://localhost:5000/api/v1/health

Use `npm run dev` for the frontend alone. To run the compiled backend, build it with `npm run build:api` and start it with `npm start`.

## Production readiness

- Production startup requires `MONGODB_URI`, an HTTPS `CLIENT_URL`, and `PASSWORD_RESET_WEBHOOK_URL`.
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
- Admin sign-in is at `/admin/login`; delivery settings and order management are at `/admin/delivery` and `/admin/orders`. Sessions use an HTTP-only, SameSite cookie, CSRF tokens, an eight-hour expiry, and a five-attempt per-15-minute sign-in limit. Order tracking requires the order number and checkout phone, returns status only, and is limited to 10 attempts per 15 minutes per IP. These limiters are process-local; use a shared rate-limit store if deploying multiple API instances. Production cookies require HTTPS.
- COD placement is restricted to the configured storefront origin and is limited to eight attempts per 15 minutes per IP. This limiter is process-local; use a shared rate-limit store for multiple API instances.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies in front of the API, or leave it at `0`. Do not trust arbitrary forwarded headers.
- Privileged account, session, delivery-setting, order-status, cancellation and cash-collection changes are written to `admin_audit_events` in the same MongoDB transaction as the change. Admin session and audit operations therefore require a transaction-capable MongoDB replica set.
- Fulfillment statuses move forward in sequence. Administrators may cancel unpaid pending or confirmed orders with a reason; the cancellation and stock restoration are atomic. COD cash can only be recorded as received after delivery. Refunds, password resets and adding further admin accounts are not supported; the bootstrap command only creates the first active admin.

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
- `npm run test:integration --workspace=@fashion-store/api` – run MongoDB replica-set order and stock integration tests

## API endpoints

- `POST /api/v1/cart/quote` – recalculate shopping-bag prices and stock from MongoDB
- `GET /api/v1/store-settings/delivery` – read the current fee and coverage
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
- `PATCH /api/v1/customer/auth/profile` – update the signed-in customer's name and Sri Lankan mobile number
- `PATCH /api/v1/customer/auth/delivery-address` – save or update the signed-in customer's default delivery address
- `PATCH /api/v1/customer/auth/password` – change the signed-in customer's password and revoke other sessions
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
