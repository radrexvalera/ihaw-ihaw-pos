# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### "Price varies" products (2026-10-07)

#### Added
- **Price varies** switch on products, for items priced by size such as Pitso and Hita. The cashier enters the price at sale, and the product's own price becomes an optional *usual price*.
- **POS price pad:**
  - Tapping a price-varies product opens it.
  - Prices already used today for that product appear as one-tap buttons, along with the usual price and the last price entered.
  - Any other price can be typed on the keypad.
  - The tile's right half reopens the pad, and the left half removes the most recently added piece.
- **One order line per price:** two sizes in one order become `1 Pitso @ ₱90` and `2 Pitso @ ₱130`. The grill and order cards still show them merged as `3 × PITSO`.
- Migration `0010_variable_price.sql`:
  - adds `products.is_variable_price`
  - allows one order item per *product and price*
  - makes `sync_order` and `cancel_order` deduct and return stock **once per product** (quantities summed), keeping the duplicate-deduction guard
  - rejects payloads where one product uses different movement ids
  - marks Pitso and Hita as price varies and enables them
- Carts saved by older versions of the app are upgraded automatically.
- Tests: multi-size lines, deduction and return happening once (in the app and in Postgres), and rejection of inconsistent movement ids (134 tests).

### Phase 7 — Production hardening (2026-10-07)

#### Security
- **Live security review** of the Supabase project:
  - RLS is on for every table.
  - Anonymous users have no table or function access.
  - Signed-in users can execute only the RPC API.
- **Fixed:** five helper and trigger functions had a mutable `search_path` (Supabase Advisor warning). Migration `0009_function_search_path.sql` was applied to production.
- **Regression tests:** every function pins its `search_path`, every table has RLS, the allowed RPC list is exact, and the audit log is admin-only.
- **Secrets check:**
  - Only the publishable key is used in the browser.
  - No secret or service-role key appears in the source or the build.
  - `.env.local` is ignored by git.

#### Added
- **Audit log viewer** (Menu → Audit log, admin):
  - Shows price and cost changes, product changes, stock in and adjustments, sold out / available, cancellations, change given, and user access changes.
  - Each entry shows who made the change, when, and a readable detail, for example "BBQ: ₱25 → ₱30".
  - Filters: All, Prices, Stock, Orders, Users. Results load 50 at a time.
- **Error boundary:** an unexpected crash shows a "Something went wrong — your sales are saved — Reload" screen instead of a blank page.
- **Production checklist and security model** sections in the README.

#### Changed
- **Performance:** the Reports screen (owner only) is lazy-loaded, so cashier and grill phones parse less code at startup. It is still precached, so it works offline.

### Phase 6 — Offline app / PWA (2026-10-07)

#### Added
- **Installable app:** a web manifest with standalone, portrait display; 192 px, 512 px, maskable and Apple touch icons rendered from the existing SVG logo; and the manifest and apple-touch-icon links in `index.html`.
- **Service worker**, generated at build time with no PWA framework (`scripts/vite-plugin-sw.ts` and `src/pwa/sw.template.js`):
  - It precaches every built file under a version derived from their contents.
  - The app shell is served from the cache first, so the app **opens with no internet**.
  - Single-page navigation falls back to the cached `index.html`.
  - Supabase traffic is never intercepted.
  - Old caches are deleted when a new version activates.
- **Safe updates:** a new version waits until someone taps **UPDATE** on a banner, so a sale is never interrupted. The app checks for updates on focus and every 30 minutes.
- **Install app** item in the menu on Android/Chrome. iPhone users get "Add to Home Screen" instructions instead.
- **Persistent storage request**, so the browser does not evict the IndexedDB where unsynced sales are kept.
- **Sync status sheet:** tap the status pill, or Menu → Sync status, to see the connection state, the time of the last sync, every change still waiting to upload (sale #27, change given, grill status, stock change and so on) with its retry count, and a plain-language explanation of any rejection. It also has **Sync now**.
- **Sign-out guard:** signing out with changes still waiting to upload asks for confirmation and explains that the changes stay on the phone.

#### Changed
- Tapping the status pill now opens Sync status instead of silently starting a sync.

### POS tile tweak (2026-10-07)

#### Changed
- **Product tiles:** once a product is in the order, the tile shows `[ − ]  qty  [ + ]`. Tapping the **left half removes one** and tapping the **right half adds one**. A product not yet in the order is added by a tap anywhere on its tile. Long-press still opens Sold out / Available, and removing gives a different vibration from adding.

### Phase 5 — Reports (2026-10-07)

#### Added
- **Reports tab (admin), with three views:**
  - **Sales:**
    - Total sales, orders, items sold, average order, and the cash/GCash split.
    - Change still owed to customers.
    - Cancelled orders are listed separately and not counted as sales.
    - Top sellers: top selling by pieces, most revenue, and highest estimated gross profit.
    - Sales by product.
  - **Profit:**
    - Sales, cost of products sold, **estimated gross profit** and gross margin, overall and per product.
    - A clear note that this is not net profit.
    - A warning that names any product sold without a unit cost.
  - **Stock:**
    - Total inventory value at cost and pieces on hand.
    - Counts of low-stock and sold-out products, plus the low-stock list.
    - Per-product stock × cost = value.
    - Non-sale stock movements from the last 14 days.
- **Periods:** Today, Yesterday, This week (starting Monday), This month, and Custom (from/to dates, up to one year), all in Manila business dates.
- **Historical accuracy:** profit uses the price and cost saved on each sale, so later changes to costs never rewrite past profit.
- **Data source:** online, reports use server data plus this phone's sales that have not synced yet. Offline, they fall back to this phone's local orders with a visible notice.
- **CSV export** for sales by product, gross profit by product, and inventory value. Exports are UTF-8 with a BOM, quoting follows RFC 4180, and product names that start like a spreadsheet formula are made safe.
- **Tests** cover the brief's own example (BBQ 100 × ₱25 at ₱14 → ₱1,100), totals and average, cancelled-order exclusion, per-sale cost snapshots, top-seller choice, missing costs, renamed products, inventory value, period ranges and CSV escaping.

#### Removed
- The "not built yet" placeholder screen. Every tab is now implemented.

### Phase 4 — Inventory (2026-10-07)

#### Added
- **Stock tab:**
  - Filter tabs with counts: All, Low stock, Sold out. Low stock includes anything below zero.
  - Each product shows its current pieces, with LOW STOCK, SOLD OUT and RECOUNT badges.
- **Product stock detail:**
  - A large current-stock figure, the low-stock alert level, and the value at cost.
  - A sold-out / available toggle.
  - The movement history from the ledger: opening, stock in, sale #, adjustment and cancelled sale. Movements made on this phone and not yet synced appear at the top with an icon.
- **ADD STOCK** (admin): enter the pieces on the keypad and see Current → Add → New. Choose *New stock* (STOCK_IN) or *Opening stock* (OPENING).
- **COUNT** (admin): enter the actual count. The app records the difference (System 42, Actual 39 → −3) as ADJUSTMENT_PLUS or ADJUSTMENT_MINUS. A reason is required: Damaged, Missing, Spoiled, Count correction, Found or Returned unused.
- Stock movements are offline-first: they are saved locally and go through the outbox using their own UUID, are idempotent on the server, and are never counted twice after sync.
- A shared on-screen keypad, used by checkout and stock entry.

#### Changed
- **Grill:** cards in *On the grill* use a compact layout, with a smaller number and timer, items listed inline, and a shorter DONE button. Waiting cards stay large.

### Phase 3 — Digital Grill Queue (2026-10-07)

#### Added
- **GRILL screen:**
  - Full-width cards in two sections, *Waiting* and *On the grill*, each with the oldest order first. The longest-waiting order has an extra outline.
  - Each card shows the order number, the token, every item as `3 × BBQ` in large text, total pieces, and a live waiting timer. The colour turns amber at 5 minutes and red at 10.
  - **No prices, payment, change or cost** appear on the grill screen.
- **START GRILLING** (new → grilling) and **DONE** (grilling → done) buttons, 80px tall. Both are local first and go through the outbox; status only ever moves forward.
- **DONE has a 4-second UNDO**, for greasy mis-taps. The change is committed immediately if the app is hidden during that window.
- **Waiting / grilling counts** in a sticky header.
- **New-order alert:** a double beep and vibration when a new order arrives. It can be muted, and the setting is remembered on the phone.
- **Screen stays on** while the grill screen is open (Wake Lock API).
- **Griller-only mode:** a griller account sees only this screen with no bottom nav. A phone registered as a grill display opens on it.
- **Second-phone offline banner:** explains that new orders will appear when the connection returns.
- **Single-phone fallback:** the GRILL tab reads the same local orders, so it works offline instantly.
- Tests for queue filtering and ordering, wait levels, the timer format and the DONE undo window.

### Phase 2 — Core POS (2026-10-07)

#### Added
- **POS screen:** large two-column product grid (more columns on wider screens). Tap adds one piece and shows a quantity badge. Sold-out and unpriced tiles are visible but cannot be tapped. Low stock shows "N LEFT". A sticky bar shows the item count, the total and CHECKOUT.
- **Long-press a product** for MARK SOLD OUT or MARK AVAILABLE. It works offline and syncs later.
- **Cart:** +, − and remove for each line; CLEAR ORDER asks for confirmation. The cart is saved on the phone, so it survives a reload, and it is re-checked when product prices or availability change.
- **Checkout:**
  - Cash or GCash, with an optional GCash reference number.
  - EXACT / ₱100 / ₱200 / ₱500 / ₱1,000 quick-cash buttons. Amounts below the total are disabled.
  - Built-in numeric keypad, so the phone keyboard never opens.
  - Live change, or "₱X short" when not enough is entered.
  - Optional customer token (1–40).
- **Sale-complete screen:** a very large `#27` with the token and total.
  - With no change owed, it closes automatically after about 2 seconds, or on a tap.
  - With change owed, it shows ⚠ CHANGE PENDING and waits for CHANGE GIVEN or LEAVE PENDING.
- **Pending-change banner** on POS and Orders ("⚠ 3 CHANGE PENDING · ₱435"). Tapping it opens a list with a CHANGE GIVEN button for each order.
- **Orders screen:**
  - Tabs: Today, Change pending, All.
  - Each card shows items, total, pieces, time, token, payment and change status, grill status, and an icon while the order is not yet synced.
  - Order detail shows prices, payment, change and references. Admins can cancel an order: a reason is required, the order is kept, and stock is returned once.
- **Local-first actions:** complete sale, mark change given, set grill status, cancel order and toggle sold out. Each one writes IndexedDB and the outbox in a single transaction.
- **Outbox push:** FIFO, one entry at a time, using idempotent RPCs.
  - Network failures keep the entry queued and are retried on reconnect, when the app regains focus, and every 30 seconds.
  - A server rejection marks the entry as an error, shows SYNC ERROR, and holds the queue so actions never reach the server out of order.
- **Order pull:**
  - Incremental, by the server's `updated_at`, with a two-minute overlap.
  - Fetches yesterday's and today's orders plus any order with change still pending.
  - Local orders with unsynced changes are not overwritten.
  - Old orders that are settled and synced are removed from the phone.
- **Realtime:** order changes from other phones trigger an immediate pull.
- Order numbers count up per phone and per Manila business day (`POS01-20261007-0027`, shown as `#27`), continuing from the highest number already on the phone.
- The status pill shows how many actions are not yet synced.
- **Tests:** cart and checkout maths, offline sale creation, order numbering, change-given idempotency, forward-only grill status, single stock return on cancel, FIFO push, retry after lost acknowledgement, network-drop retry with the same UUIDs, rejection blocking, handling of an order already cancelled on another phone, and a client↔server contract test that runs the app's payload through the real `sync_order` (90 tests in total).

### Phase 1 — Foundation (2026-10-07)

#### Added
- Architecture and requirements review in `docs/ARCHITECTURE.md`: schema, offline sync, duplicate prevention, the pending-change and grill flows, screen layouts, and the roadmap.
- Project setup: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide, ESLint, Vitest, a Netlify config, and `.env.example`.
- Supabase migrations `0001`–`0007`:
  - Tables: profiles, devices, settings, products, orders, order items, an append-only inventory ledger, and audit logs. All money is stored as integer centavos.
  - `products.stock_quantity` can change only through the inventory ledger trigger.
  - Order items store the product name, unit price and unit cost at the time of sale.
  - Idempotent RPC write API: `sync_order`, `mark_change_given`, a forward-only `set_grill_status`, `cancel_order`, `record_stock_movement`, `set_product_sold_out`, and `register_device`.
  - RLS on every table. Clients have no direct write access to sales or the inventory ledger.
  - Audit triggers for price, cost, sold-out, enable/disable, stock and user-access changes.
  - Realtime publication for orders and products.
- Seed data with editable sample products. Products with unknown prices start disabled.
- Database tests that run the real migrations on PGlite. They cover RLS, duplicate-sale prevention, single inventory deduction, cost snapshots, change-given idempotency, grill status regressions, cancellation stock return and audit entries.
- Money utilities that use integer centavos, plus Manila business-date and time helpers, with tests.
- IndexedDB (Dexie) local store: products, orders, local movements, outbox and meta.
- Sync engine (pull side): settings and products, triggered by realtime, reconnects, regaining focus and a timer. Confirmed movements are reconciled without double counting.
- Supabase email/password sign-in. Profile and role are cached so the app opens offline. Screens for inactive accounts and for a first sign-in without internet.
- One-time device registration (`POS01` / `GRILL01`), with `last_seen` refreshed whenever the phone is online.
- Mobile app shell: header with the business name, an ONLINE / OFFLINE / SYNCING / SYNC ERROR pill and a menu; bottom navigation filtered by role (the griller sees only the grill screen).
- Admin settings:
  - Products: add, edit, disable, set price and cost, estimated profit per piece, low-stock threshold, sold out, reorder.
  - Business info.
  - Users: activate users and assign roles.
  - Devices: list of registered phones.
- Read-only Stock screen with low stock, sold out and negative stock badges.

#### Fixed
- An owner account created in the Supabase dashboard before the migrations were applied had no profile, so sign-in failed with "Cannot coerce the result to a single JSON object". Migration `0008_backfill_profiles.sql` creates missing profiles; the oldest such user becomes admin if there is no active admin yet. A missing profile now shows a clear message instead of that error.
- The Sign out button was hard to see on dark screens.

#### Changed (from the original brief)
- Payment fields are part of `orders`. There is no separate `payments` table, because V1 has one payment per order and no split payments.
- Dropped `subtotal` (no discounts) and `payment_status` (every order is paid at checkout).
- Sync status is tracked only on the device, not as a server column.
