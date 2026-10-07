# Ihaw-Ihaw POS

A small, fast, mobile-first and offline-first point of sale for a Philippine street BBQ (ihaw-ihaw) cart.
It works like a **fast cash register plus a digital grill queue**. It is deliberately *not* a restaurant ERP.

The full design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): schema, sync, the pending-change flow, the grill queue, screen layouts and the roadmap.

## Project status

| Phase | Status |
|---|---|
| 1. Foundation: schema, auth, roles, devices, products admin, app shell | ✅ Done |
| 2. Core POS: cart, checkout, change pending, orders, outbox sync | ✅ Done |
| 3. Grill queue | ✅ Done |
| 4. Inventory | ✅ Done |
| 5. Reports | ✅ Done |
| 6. Offline / PWA install | ✅ Done |
| 7. Production hardening | ✅ Done |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide icons
- **Local data:** IndexedDB via Dexie (`dexie-react-hooks` for live queries)
- **Backend:** Supabase (Postgres, Auth, Realtime, RLS, RPC functions)
- **Hosting:** Netlify (static SPA)
- **Tests:** Vitest. Database tests run the real migrations on PGlite (in-process Postgres), so Docker is not needed.

## Local development

Requires Node 22 or later.

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase URL + anon key
npm run dev                    # http://localhost:5173 (use --host to open on your phone)
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Run the TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests and the database tests (migrations, RLS, RPC idempotency) |
| `npm run build` | Make the production build in `dist/` |
| `npm run check` | Run all four of the above |

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |

Only the **anon public** key belongs in the frontend. **Never** put the `service_role` key in `.env.local`, in Netlify environment variables for this site, or anywhere else in this app. All access control is enforced by RLS and by the role checks inside the RPC functions. `.env*` files are git-ignored, except `.env.example`.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com). Choose the Singapore region (closest to the Philippines).
2. **Authentication → Providers → Email:** keep Email enabled, and **turn off "Allow new users to sign up"**. Staff accounts are created by the owner.
3. Apply the migrations and seed data (next section).
4. **Authentication → Users → Add user:** create the **owner's account first**. The first account ever created automatically becomes an active **admin**.
5. Create the other staff accounts the same way. They start **inactive**. The owner activates them and assigns a role in the app under **Menu → Users**.

## Database migrations

Migrations live in `supabase/migrations/` and are applied in order:

| File | Contents |
|---|---|
| `0001_initial_schema.sql` | Profiles and roles, devices, settings, helper functions |
| `0002_products.sql` | Products. Stock is guarded so it can only change through the ledger. |
| `0003_orders.sql` | Orders (payment fields included) and order items with price and cost snapshots |
| `0004_inventory.sql` | Append-only inventory ledger and the trigger that maintains stock |
| `0005_audit.sql` | Audit log and audit triggers |
| `0006_functions.sql` | RPC write API: `sync_order`, `mark_change_given`, `set_grill_status`, `cancel_order`, `record_stock_movement`, `set_product_sold_out`, `register_device` |
| `0007_rls.sql` | Row Level Security, grants, Realtime publication |
| `0008_backfill_profiles.sql` | Creates profiles for logins made before the migrations existed |
| `0009_function_search_path.sql` | Security hardening: pins `search_path` on every function |

To apply them to your hosted project with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed      # migrations + sample products
```

To run a full local Supabase instead (needs Docker): `npx supabase start`, then `npx supabase db reset`.

## Seed data

`supabase/seed.sql` adds **sample** products with the known starter prices: BBQ ₱25, Liempo ₱100, Tenga ₱20, and so on. Everything can be edited in **Menu → Products**.

- **Pitso / Chicken Breast** and **Hita** have no known price yet. They are seeded at ₱0 and **disabled**. Set a price, then enable them.
- **Unit costs are all ₱0.** Set them before trusting the gross profit report. The products screen marks these with a "No cost" badge.
- Running the seed again is safe (it skips existing names).

## Running locally on a phone

```bash
npm run dev -- --host
```

Open the printed network URL on a phone connected to the same Wi-Fi. Installing the app as a PWA and service-worker caching need HTTPS, so test those on the Netlify deploy.

## Production build

```bash
npm run build      # outputs dist/
npm run preview    # serves dist/ locally
```

## Netlify deployment

1. Push the repository to GitHub.
2. In Netlify, choose **Add new site → Import from Git** and pick the repository. The build settings come from `netlify.toml`: build command `npm run build`, publish directory `dist`, SPA redirect, and cache headers.
3. **Site settings → Environment variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Then, in **Supabase → Authentication → URL Configuration**, set the Site URL to your Netlify URL.

## PWA setup

The app is an installable Progressive Web App:

- **Manifest:** `public/manifest.webmanifest` sets standalone display, portrait orientation, charcoal theme colours, and 192 px, 512 px and maskable 512 px icons, plus an Apple touch icon.
- **Service worker:** `src/pwa/sw.template.js` holds the logic. At build time, `scripts/vite-plugin-sw.ts` turns it into `dist/sw.js` containing the exact list of built files and a version derived from their contents, so no PWA framework is needed.
  - On install it downloads the whole app shell (about 170 KB gzipped), so the app **opens with no signal**.
  - Supabase requests (another origin) are never cached. Data sync is handled by the app's outbox.
  - A new version is downloaded in the background. A blue **"New version ready → UPDATE"** banner appears, and the app only reloads when someone taps it, so a sale is never interrupted. The cart and all data survive the reload.
- **Persistent storage:** the app asks the browser not to evict IndexedDB, where unsynced sales are kept.
- The service worker is registered **only in production builds**. To test it locally, run `npm run build && npm run preview`. To test it on a phone, use the HTTPS Netlify deploy.

**Installing on a phone:**
- **Android (Chrome):** Menu → **Install app**, or the browser's own "Add to Home screen".
- **iPhone (Safari):** Share → **Add to Home Screen**. The app's menu shows this hint on iPhone.

**Checking offline start:** open the deployed site once while online. Then turn on airplane mode, close the app completely, and reopen it from the home screen. It should open straight to the POS, and sales should keep working.

## Offline architecture (summary)

- The UI reads **only** from IndexedDB, never from the network, so taps, cart maths and checkout are instant and work with no signal.
- Every action is written to IndexedDB together with an **outbox** entry in a single transaction.
- Supabase sessions and the user's role are cached, so the app opens offline after the first sign-in.
- The header pill always shows **ONLINE / OFFLINE / SYNCING / SYNC ERROR**. Tapping it syncs immediately. A sale is never blocked by the network.

## Sync architecture (summary)

- UUIDs are generated on the device for orders, items, inventory movements and outbox entries.
- The outbox is sent **in FIFO order**. An entry is deleted only after the server acknowledges it.
- Every server write is an idempotent RPC. `sync_order` returns `duplicate` for an order that already exists, and its inserts run in one transaction.
- Stock changes **only** through the `inventory_movements` ledger. A retried movement inserts nothing, so its trigger does not fire. A unique index on `(order, product, movement type)` is a second guard against double deduction.
- Displayed stock = server stock + this device's unconfirmed movements. Confirmed movements are cleared in the same transaction that stores fresh server stock.

See §7–§8 of the architecture doc for the step-by-step guarantees.

## Production checklist

Do these once, before the cart starts using the app for real:

1. **Supabase → Authentication → Sign In / Providers:** turn off *Allow new users to sign up*.
2. **Supabase → Authentication → URL Configuration:** set *Site URL* to your Netlify URL.
3. **Supabase → Advisors → Security Advisor:** it should show no errors. The tests in `tests/db/schema.test.ts` also check that RLS is on for every table, that every function pins its `search_path`, and that signed-in users can execute only the RPC API.
4. **Netlify → Environment variables:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable `sb_publishable_…` key), and **never** the secret or service-role key.
5. **Products:** set a unit cost for every product. Set prices for Pitso and Hita, then enable them.
6. **Stock:** use Stock → Count to set each product's actual starting count.
7. **Each phone:** open the Netlify URL, sign in, register the phone (cashier or grill), install it to the home screen, then test once in airplane mode.
8. **Phone clocks** must be set automatically, because sale times come from the phone.

## Security model (summary)

- **Row Level Security** is enabled on every table.
- **Anonymous users** have no table access and cannot call any function.
- **Signed-in, active staff** can *read* according to role. Every sales or inventory *write* goes through a `SECURITY DEFINER` RPC that checks the caller's role. Clients have no `INSERT/UPDATE/DELETE` on orders, order items, the inventory ledger or the audit log.
- **Stock** can change only through the append-only ledger, enforced by a trigger, even for admins.
- **The audit log** is written only by triggers and RPCs, and only admins can read it (Menu → Audit log).
- **The browser** only ever holds the publishable key.

## User roles

| Role | Can |
|---|---|
| **Admin** (owner) | Everything: products, prices and costs, stock adjustments, reports, cancel orders, users, settings, audit log |
| **Cashier** | Sell, view orders, record payment, mark change given, view stock, mark products sold out or available |
| **Griller** | See the grill queue and mark orders Start grilling or Done. Nothing else. |

Roles are enforced by RLS (reads) and by role checks inside each RPC (writes), not by the UI.

## Known limitations (V1)

- **The grill display on a second phone needs internet.** Cross-device updates go through Supabase Realtime. If both phones are offline, the cashier keeps selling normally and the grill phone catches up when either phone reconnects. On a single phone, the GRILL tab always works offline.
- **The first sign-in on a phone needs internet.** After that the app works offline.
- **Product, price, user and settings changes need internet.** They are admin tasks and are rare.
- **Sale time comes from the phone's clock.** Keep phone clocks set automatically.
- **No receipts or printing.** This is by design.
- **One payment per order** (cash *or* GCash). There are no split payments.
