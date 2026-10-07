-- 0002_products.sql
-- Sellable products. Prices and costs are integer centavos.
-- stock_quantity is a running total maintained ONLY by the inventory ledger
-- trigger (see 0004_inventory.sql) — it can never be written directly.

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) > 0),
  selling_price       integer not null default 0 check (selling_price >= 0),
  unit_cost           integer not null default 0 check (unit_cost >= 0),
  stock_quantity      integer not null default 0,
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  is_active           boolean not null default true,
  is_sold_out         boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index products_name_unique on public.products (lower(trim(name)));
create index products_sort_idx on public.products (sort_order, name);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Guard: stock_quantity starts at 0 and may only change while the inventory
-- ledger trigger has set app.inventory_write = 'on' for its own statement.
create or replace function public.products_guard_stock()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.stock_quantity := 0;
  elsif new.stock_quantity is distinct from old.stock_quantity
        and coalesce(current_setting('app.inventory_write', true), '') <> 'on' then
    raise exception 'stock_quantity can only change through inventory movements'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger products_guard_stock
  before insert or update on public.products
  for each row execute function public.products_guard_stock();
