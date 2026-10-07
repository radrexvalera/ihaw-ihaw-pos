-- 0005_audit.sql
-- Simple audit log. Written only by triggers and SECURITY DEFINER functions,
-- so the important events cannot be skipped by a client.

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create or replace function public.write_audit(
  p_action    text,
  p_entity    text,
  p_entity_id text,
  p_details   jsonb default '{}'::jsonb,
  p_user_id   uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (coalesce(p_user_id, auth.uid()), p_action, p_entity, p_entity_id,
          coalesce(p_details, '{}'::jsonb));
$$;

-- Product changes that matter to the owner.
create or replace function public.products_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('product_created', 'product', new.id::text,
      jsonb_build_object('name', new.name, 'selling_price', new.selling_price,
                         'unit_cost', new.unit_cost));
    return new;
  end if;

  if new.selling_price is distinct from old.selling_price then
    perform public.write_audit('product_price_changed', 'product', new.id::text,
      jsonb_build_object('name', new.name, 'from', old.selling_price, 'to', new.selling_price));
  end if;
  if new.unit_cost is distinct from old.unit_cost then
    perform public.write_audit('product_cost_changed', 'product', new.id::text,
      jsonb_build_object('name', new.name, 'from', old.unit_cost, 'to', new.unit_cost));
  end if;
  if new.is_sold_out is distinct from old.is_sold_out then
    perform public.write_audit(
      case when new.is_sold_out then 'product_marked_sold_out' else 'product_marked_available' end,
      'product', new.id::text, jsonb_build_object('name', new.name));
  end if;
  if new.is_active is distinct from old.is_active then
    perform public.write_audit(
      case when new.is_active then 'product_enabled' else 'product_disabled' end,
      'product', new.id::text, jsonb_build_object('name', new.name));
  end if;
  if new.name is distinct from old.name then
    perform public.write_audit('product_renamed', 'product', new.id::text,
      jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  return new;
end;
$$;

create trigger products_audit
  after insert or update on public.products
  for each row execute function public.products_audit();

-- Inventory adjustments / stock in are audited (sales are not: the order is the record).
create or replace function public.inventory_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type in ('OPENING', 'STOCK_IN', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS') then
    perform public.write_audit('inventory_' || lower(new.movement_type), 'product',
      new.product_id::text,
      jsonb_build_object('movement_id', new.id, 'quantity_change', new.quantity_change,
                         'reason', new.reason),
      new.created_by);
  end if;
  return new;
end;
$$;

create trigger inventory_audit
  after insert on public.inventory_movements
  for each row execute function public.inventory_audit();

-- Role / activation changes.
create or replace function public.profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    perform public.write_audit('user_access_changed', 'profile', new.id::text,
      jsonb_build_object('role_from', old.role, 'role_to', new.role,
                         'active_from', old.is_active, 'active_to', new.is_active));
  end if;
  return new;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.profiles_audit();
