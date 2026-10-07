-- 0003_orders.sql
-- Orders and order items. One payment per order (no split payments in V1),
-- so payment fields live on the order row.
-- Order ids are UUIDs generated on the device; order_number is display-only.

create table public.orders (
  id                    uuid primary key,
  order_ref             text not null,                 -- POS01-20261007-0027
  order_number          integer not null check (order_number > 0),  -- #27
  business_date         date not null,                 -- Asia/Manila calendar day
  customer_token_number integer check (customer_token_number > 0),

  status                text not null default 'completed'
                        check (status in ('completed', 'cancelled')),

  total                 integer not null check (total >= 0),
  payment_method        text not null check (payment_method in ('cash', 'gcash')),
  payment_reference     text,                          -- e.g. GCash ref no.
  amount_received       integer not null,
  change_due            integer not null default 0 check (change_due >= 0),
  change_given          boolean not null default true,
  change_given_at       timestamptz,
  change_given_by       uuid references public.profiles (id) on delete set null,

  grill_status          text not null default 'new'
                        check (grill_status in ('new', 'grilling', 'done', 'cancelled')),
  grill_started_at      timestamptz,
  grill_done_at         timestamptz,

  device_id             uuid not null references public.devices (id),
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null,          -- device clock (real sale time)
  synced_at             timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  cancelled_at          timestamptz,
  cancelled_by          uuid references public.profiles (id) on delete set null,
  cancellation_reason   text,

  constraint orders_change_math check (change_due = amount_received - total),
  constraint orders_change_given_consistent check (change_due > 0 or change_given),
  constraint orders_cancel_reason check (
    status <> 'cancelled'
    or (cancelled_at is not null and length(trim(coalesce(cancellation_reason, ''))) > 0)
  )
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_business_date_idx on public.orders (business_date);
create index orders_device_day_idx on public.orders (device_id, business_date, order_number);
create index orders_updated_at_idx on public.orders (updated_at);
create index orders_grill_queue_idx on public.orders (grill_status, created_at)
  where status = 'completed' and grill_status in ('new', 'grilling');
create index orders_change_pending_idx on public.orders (created_at)
  where status = 'completed' and not change_given;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id                    uuid primary key,
  order_id              uuid not null references public.orders (id),
  product_id            uuid not null references public.products (id),
  product_name_snapshot text not null,
  quantity              integer not null check (quantity > 0),
  unit_price            integer not null check (unit_price >= 0),  -- price AT SALE
  unit_cost             integer not null check (unit_cost >= 0),   -- cost AT SALE
  line_total            integer not null,
  constraint order_items_line_total check (line_total = quantity * unit_price),
  constraint order_items_one_line_per_product unique (order_id, product_id)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
