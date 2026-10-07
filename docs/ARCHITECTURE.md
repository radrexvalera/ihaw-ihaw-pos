# Ihaw-Ihaw POS — Architecture (Version 1)

A fast mobile cash register plus a digital grill board for one small BBQ cart.
Not a restaurant ERP.

---

## 1. Requirements review: what was simplified and why

| Requirement as written | V1 decision | Why |
|---|---|---|
| Separate `payments` table | **Folded into `orders`** (`payment_method`, `amount_received`, `payment_reference`) | One payment per order, no split payments. A separate table only adds a join and one more thing to sync and duplicate. If split payments are needed later, a `payments` table is a single additive migration. |
| `orders.subtotal` and `orders.total` | **`total` only** | No discounts, tax lines or service charges, so subtotal always equals total. |
| `orders.payment_status` | **Dropped** | Customers always pay at checkout. An order that exists is paid. The state that actually varies is the change: `change_due` and `change_given`. |
| `orders.sync_status` on the server | **Local only (IndexedDB)** | A row on the server is synced by definition. Sync state lives on the device's outbox. |
| Order statuses | `status`: `completed` / `cancelled` | Grill progress is a separate column (`grill_status`: `new` / `grilling` / `done` / `cancelled`). Payment, change and grill are independent, as required. |
| Order number uniqueness | `order_number` (daily, per device) is **display only**. No unique constraint on it. | The UUID is the identity. A reused display number (for example after the app's data is cleared) must never block a sync. |
| Users signing up | **No sign-up in the app.** Users are created in the Supabase dashboard. The first user becomes admin. Later users start inactive until an admin activates them and assigns a role. | Nobody can create their own account and start selling. |
| Product CRUD offline | **Online only** (admin, occasional) | Only cashier actions must work offline: sales, change given, grill status, sold-out toggle, cancellations. Admin edits are rare and happen when there is signal. |
| Reports offline | Reports query Supabase. When offline they fall back to **this device's local orders**, with a visible "local data only" note. | Owners read reports when there is signal. The cart must never stop selling. |
| Stock going negative | **Allowed, with a warning** | The skewer is physically in the customer's hand. Blocking the sale because the count is off is worse than recording a negative count to correct later. |
| Peer-to-peer / LAN sync | **Not built.** The outbox design allows adding it later. | As specified. |

Nothing else was cut. Every V1 feature in the brief is kept.

---

## 2. Technical architecture

```
┌──────────────────── PHONE (PWA) ────────────────────┐
│  React UI  ──reads──▶  Dexie (IndexedDB)  ◀─writes── │
│     │                   products, orders,           │
│     │ writes            movements, outbox, meta     │
│     ▼                        ▲         │            │
│  Local actions ──────────────┘         │            │
│  (sale, change given, grill status…)   │            │
│                                        ▼            │
│                Sync engine: push outbox (FIFO, RPC) │
│                             pull products + orders  │
└────────────────────────────────┬────────────────────┘
                                 │ HTTPS + Realtime WS
                     ┌───────────▼───────────┐
                     │ Supabase              │
                     │  Postgres + RLS       │
                     │  RPC functions (all   │
                     │  writes to sales and  │
                     │  inventory)           │
                     │  Realtime: orders,    │
                     │  products             │
                     └───────────────────────┘
```

**Rule 1:** the UI only ever reads from IndexedDB, through Dexie `useLiveQuery`. It never waits on the network.

**Rule 2:** every user action is written to IndexedDB first, together with an outbox entry, in one Dexie transaction. The screen updates instantly.

**Rule 3:** the sync engine sends outbox entries to Supabase RPCs in order. Every RPC is idempotent.

**Rule 4:** realtime events and reconnects trigger a pull, which refreshes the local copy.

Stack: React 19, TypeScript, Vite, Tailwind v4, Lucide, Dexie, supabase-js, a PWA service worker, Netlify. There is no router (tab state is enough) and no state library (Dexie is the store).

Money is stored as **integer centavos** everywhere: Postgres `integer` and TypeScript `number`. ₱25.00 is stored as `2500`. Integers are exact well beyond any amount a cart will see. Pesos are only parsed and formatted at the UI edge (`src/lib/money.ts`).

Time: `created_at` is the device time, so an offline sale keeps its real time. `synced_at` is the server time. `business_date` is the calendar date in Asia/Manila, used for daily order numbers and reports.

---

## 3. Database schema (8 tables)

```
profiles (1 per auth user)
  id uuid PK → auth.users        role: admin|cashier|griller     is_active

devices
  id uuid PK (generated on the phone)   device_code 'POS01'|'GRILL01'
  device_name   device_type: cashier|griller   last_seen

settings (single row, id = 1)
  business_name, business_address, business_phone

products
  id uuid PK   name   selling_price int¢   unit_cost int¢
  stock_quantity int  (changed ONLY by the inventory_movements trigger)
  low_stock_threshold   is_active   is_sold_out   sort_order

orders
  id uuid PK (generated on the phone)
  order_ref 'POS01-20261007-0027'   order_number 27   business_date
  customer_token_number int NULL
  status completed|cancelled
  total int¢   payment_method cash|gcash   payment_reference NULL
  amount_received int¢   change_due int¢   (CHECK change_due = received − total)
  change_given bool   change_given_at   change_given_by → profiles
  grill_status new|grilling|done|cancelled   grill_started_at   grill_done_at
  device_id → devices   created_by → profiles   created_at (device)  synced_at
  cancelled_at   cancelled_by   cancellation_reason

order_items
  id uuid PK   order_id → orders   product_id → products
  product_name_snapshot   quantity   unit_price int¢   unit_cost int¢
  line_total int¢  (CHECK = quantity × unit_price)

inventory_movements  (append-only ledger)
  id uuid PK   product_id → products   quantity_change (±, never 0)
  movement_type OPENING|STOCK_IN|SALE|ADJUSTMENT_PLUS|ADJUSTMENT_MINUS|CANCELLED_SALE_RETURN
  reference_id (order id for SALE / CANCELLED_SALE_RETURN)   reason
  created_at   created_by   device_id
  UNIQUE (reference_id, product_id, movement_type)  ← second guard against double deduction

audit_logs
  id   user_id   action   entity   entity_id   details jsonb   created_at
```

### How they relate

- **Product → Order item:** an order item points at a product but **copies** its name, price and cost at the moment of sale. Later changes to the product never change past sales or past profit.
- **Order → Order items:** one order has one or more items (one line per product).
- **Order → Payment:** the payment is part of the order row (see §1).
- **Order → Inventory movements:** each order item produces exactly one `SALE` movement (−qty) with `reference_id = order.id`. Cancelling produces one `CANCELLED_SALE_RETURN` (+qty) per item.
- **Inventory movements → Product stock:** `products.stock_quantity` is a running total, maintained only by an `AFTER INSERT` trigger on the ledger. Updating it directly raises an error. Stock always equals the sum of the ledger.
- **Device → Orders and movements:** every order and movement records the device that created it. This drives order numbering (`POS01-…`) and the audit trail.
- **Profiles:** `created_by`, `change_given_by`, `cancelled_by` and `audit_logs.user_id` all reference profiles.

### Write path and security

Clients **never** insert or update `orders`, `order_items` or `inventory_movements` directly. RLS gives them select-only access. All writes go through `SECURITY DEFINER` RPCs, each of which checks the caller's role:

| RPC | Roles | Idempotency |
|---|---|---|
| `register_device` | any active user | upsert on device id |
| `sync_order` | admin, cashier | `orders.id` PK; returns `duplicate` if it already exists |
| `mark_change_given` | admin, cashier | `WHERE change_given = false` |
| `set_grill_status` | all roles | forward-only (`new → grilling → done`); stale or repeated calls do nothing |
| `cancel_order` | admin | row lock; returns `already_cancelled` |
| `record_stock_movement` | admin | movement id PK |
| `set_product_sold_out` | admin, cashier | setting the same value is a no-op |

Admins edit `products` and `settings` directly, under RLS. Triggers on `products` write audit entries for price, cost and sold-out changes.

---

## 4. Pending Change workflow

1. At checkout the cashier enters the amount received. `change_due = received − total` is calculated locally.
2. **COMPLETE SALE** always succeeds. It writes the order (with `change_given = false` if `change_due > 0`), the items, the SALE movements and an outbox entry. The grill order exists at that moment.
3. The sale-complete screen shows the order number. If `change_due > 0`, it shows **⚠ CHANGE PENDING ₱315** with **[CHANGE GIVEN]** and **[LEAVE PENDING]**.
   - CHANGE GIVEN sets `change_given = true`, `change_given_at = now`, `change_given_by = user` locally and queues a `mark_change_given` outbox entry.
   - LEAVE PENDING returns to the POS. The order stays pending.
4. A banner on POS and Orders, **⚠ 3 CHANGE PENDING · ₱435**, is a live query over local orders where `change_given = false` and `status = completed`. Tapping it opens a sheet listing each order with its own [CHANGE GIVEN] button.
5. Grill status is never affected. An order can be "change pending" and "grilling" at the same time.
6. Cancelling an order with pending change is allowed. The cancellation dialog reminds the cashier to return the customer's money.

---

## 5. Digital Grill Queue workflow

1. A sale creates an order with `grill_status = new`.
2. The GRILL screen is a live query over local orders where `status = completed` and `grill_status` is `new` or `grilling`, oldest first.
   - **Single device:** the order is already in local IndexedDB, so it appears instantly with no network.
   - **Two devices:** the cashier's outbox pushes `sync_order`. Supabase Realtime sends an `orders` INSERT to the griller phone, which pulls the order and its items into its own IndexedDB, and the card appears.
3. The card shows the order number, token (if any), item quantities, total pieces and a live waiting timer. Its accent turns amber at 5 minutes and red at 10, and the oldest order is on top. Prices, payment and change are not shown.
4. **START GRILLING** sets `grilling` and **DONE** sets `done`. Both are local first, then sent through the outbox via `set_grill_status`. Forward-only on the server means two people tapping, or a delayed retry, can never move an order back.
5. DONE has a 4-second UNDO (greasy fingers). After that it commits, and the order leaves the queue but remains in ORDERS → Today.
6. A double beep and vibration announce each new order. The griller can mute it.

---

## 6. Offline operation

- **App shell:** the service worker precaches the built JS, CSS, HTML and icons, so the app opens with no signal once it has been installed.
- **Data:** IndexedDB (Dexie) holds products (with price, cost and stock), recent orders (the last 2 business days plus anything still pending), the outbox, unsynced inventory movements, and meta (device id and code, cached profile, daily order counter, sync cursors).
- **Auth:** supabase-js keeps the session in localStorage. Offline, the cached session and cached profile (role) are used as they are. A first login on a device needs signal.
- **Order numbers:** a per-device, per-business-day counter in IndexedDB. When the device comes online it moves the counter up to the server's highest number for that device and day, so clearing the browser does not restart at #1 for that day.
- **UUIDs:** generated on the device (`crypto.randomUUID()`) for orders, items, movements and outbox entries.
- **Status pill:** ONLINE / OFFLINE / SYNCING (n) / SYNC ERROR, always shown in the header. A sync error never blocks a sale.

---

## 7. How offline sync avoids duplicate sales

1. Completing a sale runs one Dexie transaction: it writes the order, its items, its SALE movements and **one outbox entry** `{id, type:'sync_order', payload, createdAt}`. Either all of it is written or none of it is.
2. The sync engine processes the outbox **in FIFO order**, one entry at a time. It deletes an entry only after the RPC has succeeded. If the app is killed mid-request, the entry is still there and will be sent again.
3. `sync_order` runs in a single Postgres transaction:
   - If an order with that UUID already exists, it returns `duplicate` without inserting anything. The client treats that as success and deletes the outbox entry.
   - Otherwise it inserts the order, then the items, then the movements, each with `ON CONFLICT DO NOTHING`. If any step fails, the whole RPC rolls back. Half-synced orders cannot exist.
   - A concurrent double-send (two tabs, a retry racing a slow request) hits the `orders.id` primary key. The `INSERT … ON CONFLICT DO NOTHING` affects zero rows, and the RPC returns `duplicate`.
4. Every follow-up action (change given, grill status, cancel) is idempotent by design (see the table in §3). Retrying any outbox entry any number of times gives the same result.
5. FIFO order guarantees that a cancel or grill update never reaches the server before the order it refers to.
6. Errors: network failures are retried with backoff (2s → 4s → … → 60s max). A server rejection (validation or permission) marks the entry `error`. The pill shows SYNC ERROR, the details appear in Settings → Sync, and the queue waits so that ordering is never violated.

## 8. How inventory avoids duplicate deductions

1. Each order item carries its **own movement UUID**, generated on the device at checkout. The local SALE movement and the server SALE movement share that id.
2. On the server, stock changes only in the `AFTER INSERT` trigger on `inventory_movements`. A retried movement hits `ON CONFLICT DO NOTHING`, nothing is inserted, the trigger does not fire, and stock is unchanged.
3. Second guard: `UNIQUE (reference_id, product_id, movement_type)`. Even if a bug produced a new UUID, an order can only ever deduct a given product once and return it once.
4. Third guard: `cancel_order` locks the order row and returns `already_cancelled` if another device got there first. The late device's return movements are discarded, so stock is never returned twice.
5. **Displayed local stock = server stock (last pulled) + unsynced local movements.** After an outbox push, the engine pulls products. In the same Dexie transaction it writes the new server stock and deletes the local movements it just confirmed. The displayed number never counts a movement twice or drops one.

---

## 9. Mobile POS screen

```
┌──────────────────────────────────┐
│ IHAW-IHAW            ● ONLINE  ☰ │  header (business name, sync pill, menu)
├──────────────────────────────────┤
│ ⚠ 2 CHANGE PENDING · ₱360      ›│  only when pending > 0 (amber, full width)
├──────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐  │
│ │ BBQ      (3)│ │ LIEMPO      │  │  2-column grid, ~88px tall tiles
│ │ ₱25         │ │ ₱100        │  │  tap = +1 (badge shows qty in cart)
│ └─────────────┘ └─────────────┘  │  long-press = sheet: MARK SOLD OUT
│ ┌─────────────┐ ┌─────────────┐  │
│ │ TENGA       │ │ ISAW MANOK  │  │
│ │ SOLD OUT    │ │ ₱10  LOW    │  │  sold out = greyed, not tappable
│ └─────────────┘ └─────────────┘  │
│            (scrolls)             │
├──────────────────────────────────┤
│ 6 ITEMS              ₱115   [^]  │  sticky cart bar; tap expands cart sheet
│ [        CHECKOUT ₱115        ]  │  ≥56px, thumb zone
├──────────────────────────────────┤
│  POS  GRILL  ORDERS  STOCK  REPORTS │  bottom nav
└──────────────────────────────────┘

Cart sheet:  BBQ  3 × ₱25 = ₱75   [−] 3 [+]  🗑      [CLEAR ORDER] (confirm)

Checkout sheet (full screen):
  TOTAL ₱185
  [ CASH ] [ GCASH ]
  RECEIVED  ₱500          (big numeric keypad, no OS keyboard)
  [EXACT] [₱100] [₱200] [₱500] [₱1,000]
  CHANGE ₱315
  TOKEN (optional) [—] [1]…[20]
  [        COMPLETE SALE        ]

Sale complete (overlay):
  ✓ SALE RECORDED   ORDER  #27  (≈120px digits)   TOTAL ₱185
  ⚠ CHANGE PENDING ₱315   [CHANGE GIVEN] [LEAVE PENDING]
  — or, with no change pending, auto-returns after ~2s; tap anywhere to dismiss
```

## 10. Griller screen

```
┌──────────────────────────────────┐
│ GRILL QUEUE   3 NEW · 1 GRILLING ● │
├──────────────────────────────────┤
│ ▌#27            TOKEN 12   4:12  │  oldest first; left bar colour = wait time
│ ▌ 3 × BBQ                        │  text ≥24px, high contrast
│ ▌ 2 × ISAW MANOK                 │
│ ▌ 1 × LIEMPO                     │
│ ▌ 6 PCS                          │
│ ▌[       START GRILLING        ] │  full width, ≥64px tall
├──────────────────────────────────┤
│ ▌#25  GRILLING             6:40  │
│ ▌ 4 × BBQ  2 × ISAW BABOY        │
│ ▌[             DONE            ] │
└──────────────────────────────────┘
```
A griller-role user sees only this screen, with no bottom nav. The screen keeps the display awake (Wake Lock API where supported).

---

## 11. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Vite/React/TS/Tailwind, lint/test tooling, full DB schema + RLS + RPCs (tested on PGlite), money/time utils, Dexie local DB, auth + roles, device registration, products admin (add/edit/disable/reorder/price/cost/sold-out), app shell, bottom nav, connection pill, settings (business, users, devices) | ✅ Done |
| 2 Core POS | Product grid, cart, checkout (cash/GCash, keypad, quick cash), change pending + banner, sale-complete screen, local order creation, orders screen (Recent / Change Pending / All), outbox + sync engine (push) | ✅ Done |
| 3 Grill | Grill queue, live wait timer, start/done, realtime pull, griller-only mode, wake lock | ✅ Done |
| 4 Inventory | Stock screen, stock in, adjustments with reasons, opening stock, ledger view, low stock, sold-out toggle via long-press | ✅ Done |
| 5 Reports | Sales, estimated gross profit, inventory value, top sellers, date filters, CSV export | ✅ Done |
| 6 Offline hardening | Service worker / PWA install, icons, backoff, error surfacing, counter recovery, offline report fallback | ✅ Done |
| 7 Production | Live RLS / security review + `search_path` fix, security regression tests, audit log viewer, error boundary, lazy-loaded reports, production checklist | ✅ Done (Netlify site still to be connected) |

### MVP (to start trading) = Phases 1–3 plus the stock deduction already built into sales
### Later (still V1, after trading starts) = Phases 4–7
### Not V1 (by design)
Receipt or kitchen printing, payments split across methods, multi-branch, LAN/peer sync, expenses or net profit, and everything in the "do not add" list.
