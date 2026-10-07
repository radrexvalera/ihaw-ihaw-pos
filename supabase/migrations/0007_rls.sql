-- 0007_rls.sql
-- Row Level Security. RLS is enabled on every table; reads are allowed to
-- active staff, direct writes only where an admin edits master data.
-- Sales/inventory writes happen exclusively through the RPCs in 0006.

alter table public.profiles            enable row level security;
alter table public.devices             enable row level security;
alter table public.settings            enable row level security;
alter table public.products            enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.orders, public.order_items,
  public.inventory_movements, public.audit_logs, public.devices
  from authenticated;
revoke insert, delete on public.profiles, public.settings from authenticated;
revoke delete on public.products from authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- profiles: see yourself; admins see and manage everyone.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role('admin'));
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- devices: visible to active staff (writes via register_device).
create policy devices_select on public.devices
  for select to authenticated
  using (public.user_role() is not null);

-- settings: readable by staff, editable by admin.
create policy settings_select on public.settings
  for select to authenticated
  using (public.user_role() is not null);
create policy settings_update_admin on public.settings
  for update to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- products: readable by staff; admin creates/edits (no deletes — disable instead).
create policy products_select on public.products
  for select to authenticated
  using (public.user_role() is not null);
create policy products_insert_admin on public.products
  for insert to authenticated
  with check (public.has_role('admin'));
create policy products_update_admin on public.products
  for update to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- orders / items: all staff can read (griller needs the queue).
create policy orders_select on public.orders
  for select to authenticated
  using (public.user_role() is not null);
create policy order_items_select on public.order_items
  for select to authenticated
  using (public.user_role() is not null);

-- inventory ledger: admin and cashier.
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (public.has_role('admin', 'cashier'));

-- audit log: admin only.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Function privileges: only the RPC API is callable by signed-in users.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.user_role()                                     to authenticated;
grant execute on function public.has_role(text[])                                to authenticated;
grant execute on function public.register_device(uuid, text, text)              to authenticated;
grant execute on function public.sync_order(jsonb)                               to authenticated;
grant execute on function public.mark_change_given(uuid, timestamptz, uuid)      to authenticated;
grant execute on function public.set_grill_status(uuid, text, timestamptz)       to authenticated;
grant execute on function public.cancel_order(uuid, text, timestamptz, uuid, jsonb) to authenticated;
grant execute on function public.record_stock_movement(jsonb)                    to authenticated;
grant execute on function public.set_product_sold_out(uuid, boolean)             to authenticated;
grant execute on function public.grill_status_rank(text)                         to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: push order and product changes to other devices.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.products;
  end if;
end;
$$;
