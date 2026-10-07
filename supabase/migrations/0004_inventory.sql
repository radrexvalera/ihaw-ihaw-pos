-- 0004_inventory.sql
-- Append-only inventory ledger. products.stock_quantity is the running sum,
-- updated only by the AFTER INSERT trigger below. Because every movement has
-- a client-generated UUID and inserts use ON CONFLICT DO NOTHING, a retried
-- movement inserts nothing, the trigger does not fire, and stock is unchanged.

create table public.inventory_movements (
  id              uuid primary key,
  product_id      uuid not null references public.products (id),
  quantity_change integer not null check (quantity_change <> 0),
  movement_type   text not null check (movement_type in (
                    'OPENING', 'STOCK_IN', 'SALE',
                    'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS', 'CANCELLED_SALE_RETURN')),
  reference_id    uuid,             -- order id for SALE / CANCELLED_SALE_RETURN
  reason          text,
  created_at      timestamptz not null,
  synced_at       timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null,
  device_id       uuid references public.devices (id),

  constraint inventory_movements_sign check (
    (movement_type in ('OPENING', 'STOCK_IN', 'ADJUSTMENT_PLUS', 'CANCELLED_SALE_RETURN')
       and quantity_change > 0)
    or (movement_type in ('SALE', 'ADJUSTMENT_MINUS') and quantity_change < 0)
  ),
  constraint inventory_movements_reason_required check (
    movement_type not in ('ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS')
    or length(trim(coalesce(reason, ''))) > 0
  ),
  constraint inventory_movements_sale_reference check (
    movement_type not in ('SALE', 'CANCELLED_SALE_RETURN') or reference_id is not null
  )
);

-- Second line of defence: an order can deduct (or return) a product only once,
-- even if a buggy client ever produced a fresh UUID for the same movement.
create unique index inventory_movements_once_per_reference
  on public.inventory_movements (reference_id, product_id, movement_type)
  where reference_id is not null;

create index inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_created_idx
  on public.inventory_movements (created_at desc);

-- Apply each new movement to the product's running stock.
create or replace function public.inventory_apply_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.inventory_write', 'on', true);
  update public.products
     set stock_quantity = stock_quantity + new.quantity_change
   where id = new.product_id;
  perform set_config('app.inventory_write', 'off', true);
  return new;
end;
$$;

create trigger inventory_apply_movement
  after insert on public.inventory_movements
  for each row execute function public.inventory_apply_movement();

-- The ledger is append-only.
create or replace function public.inventory_movements_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory_movements is append-only' using errcode = '42501';
end;
$$;

create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.inventory_movements_immutable();
