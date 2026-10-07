-- 0010_variable_price.sql
-- "Price varies" products (e.g. Pitso, Hita priced by size): the cashier
-- enters the price at sale. One order may therefore hold the same product at
-- different prices (one order_item per price). Stock is still deducted ONCE
-- per product per order: SALE / return movements are grouped by product, and
-- the one-movement-per-(order, product, type) unique index stays in place.

alter table public.products
  add column is_variable_price boolean not null default false;

comment on column public.products.is_variable_price is
  'Price is entered at sale (sizes vary). selling_price is then only the usual/suggested price.';

-- One line per product AND price (was: one line per product).
alter table public.order_items drop constraint order_items_one_line_per_product;
alter table public.order_items
  add constraint order_items_one_line_per_product_price unique (order_id, product_id, unit_price);

-- ---------------------------------------------------------------------------
-- sync_order: SALE movements grouped per product. All items of a product must
-- share one movement_id (and a movement_id must belong to one product), or the
-- unique guard could silently skip a deduction — so that is validated.
-- ---------------------------------------------------------------------------
create or replace function public.sync_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid := (p_order ->> 'id')::uuid;
  v_items      jsonb := coalesce(p_order -> 'items', '[]'::jsonb);
  v_total      integer := (p_order ->> 'total')::integer;
  v_received   integer := (p_order ->> 'amount_received')::integer;
  v_change     integer := (p_order ->> 'change_due')::integer;
  v_method     text := p_order ->> 'payment_method';
  v_items_sum  integer;
  v_created_by uuid := coalesce((p_order ->> 'created_by')::uuid, auth.uid());
  v_created_at timestamptz := (p_order ->> 'created_at')::timestamptz;
  v_rows       integer;
begin
  if not public.has_role('admin', 'cashier') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Order id is required';
  end if;

  if exists (select 1 from public.orders where id = v_id) then
    return jsonb_build_object('result', 'duplicate', 'id', v_id);
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Order has no items';
  end if;
  select coalesce(sum((i ->> 'quantity')::integer * (i ->> 'unit_price')::integer), 0)
    into v_items_sum
    from jsonb_array_elements(v_items) as i;
  if v_items_sum <> v_total then
    raise exception 'Order total % does not match items %', v_total, v_items_sum;
  end if;
  if v_received < v_total then
    raise exception 'Amount received is less than total';
  end if;
  if v_method = 'gcash' and v_received <> v_total then
    raise exception 'GCash amount must equal total';
  end if;
  if v_change <> v_received - v_total then
    raise exception 'Change due is incorrect';
  end if;
  if exists (
       select 1 from jsonb_array_elements(v_items) i
        group by i ->> 'product_id' having count(distinct i ->> 'movement_id') > 1)
     or exists (
       select 1 from jsonb_array_elements(v_items) i
        group by i ->> 'movement_id' having count(distinct i ->> 'product_id') > 1) then
    raise exception 'Each product must use exactly one movement id';
  end if;

  insert into public.orders (
    id, order_ref, order_number, business_date, customer_token_number,
    status, total, payment_method, payment_reference, amount_received,
    change_due, change_given, change_given_at, change_given_by,
    grill_status, device_id, created_by, created_at
  ) values (
    v_id,
    p_order ->> 'order_ref',
    (p_order ->> 'order_number')::integer,
    (p_order ->> 'business_date')::date,
    nullif(p_order ->> 'customer_token_number', '')::integer,
    'completed',
    v_total,
    v_method,
    nullif(trim(coalesce(p_order ->> 'payment_reference', '')), ''),
    v_received,
    v_change,
    coalesce((p_order ->> 'change_given')::boolean, v_change = 0) or v_change = 0,
    (p_order ->> 'change_given_at')::timestamptz,
    (p_order ->> 'change_given_by')::uuid,
    'new',
    (p_order ->> 'device_id')::uuid,
    v_created_by,
    v_created_at
  )
  on conflict (id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('result', 'duplicate', 'id', v_id);
  end if;

  insert into public.order_items (
    id, order_id, product_id, product_name_snapshot,
    quantity, unit_price, unit_cost, line_total
  )
  select x.id, v_id, x.product_id, x.product_name_snapshot,
         x.quantity, x.unit_price, x.unit_cost, x.quantity * x.unit_price
    from jsonb_to_recordset(v_items) as x(
           id uuid, movement_id uuid, product_id uuid, product_name_snapshot text,
           quantity integer, unit_price integer, unit_cost integer);

  insert into public.inventory_movements (
    id, product_id, quantity_change, movement_type, reference_id,
    created_at, created_by, device_id
  )
  select x.movement_id, x.product_id, -sum(x.quantity), 'SALE', v_id,
         v_created_at, v_created_by, (p_order ->> 'device_id')::uuid
    from jsonb_to_recordset(v_items) as x(movement_id uuid, product_id uuid, quantity integer)
   group by x.movement_id, x.product_id
  on conflict do nothing;

  return jsonb_build_object('result', 'created', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_order: one return movement per product (quantities summed).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(
  p_order_id     uuid,
  p_reason       text,
  p_at           timestamptz default now(),
  p_device_id    uuid default null,
  p_movement_ids jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.has_role('admin') then
    raise exception 'Only an admin can cancel orders' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A cancellation reason is required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled', 'id', p_order_id);
  end if;

  update public.orders
     set status              = 'cancelled',
         grill_status        = 'cancelled',
         cancelled_at        = coalesce(p_at, now()),
         cancelled_by        = auth.uid(),
         cancellation_reason = trim(p_reason)
   where id = p_order_id;

  insert into public.inventory_movements (
    id, product_id, quantity_change, movement_type, reference_id,
    reason, created_at, created_by, device_id
  )
  select coalesce((p_movement_ids ->> oi.product_id::text)::uuid, gen_random_uuid()),
         oi.product_id, sum(oi.quantity), 'CANCELLED_SALE_RETURN', p_order_id,
         trim(p_reason), coalesce(p_at, now()), auth.uid(), p_device_id
    from public.order_items oi
   where oi.order_id = p_order_id
   group by oi.product_id
  on conflict do nothing;

  perform public.write_audit('sale_cancelled', 'order', p_order_id::text,
    jsonb_build_object('order_ref', v_order.order_ref, 'total', v_order.total,
                       'reason', trim(p_reason),
                       'change_was_pending', not v_order.change_given));
  return jsonb_build_object('result', 'cancelled', 'id', p_order_id);
end;
$$;

-- create or replace keeps existing grants; re-assert them explicitly anyway.
revoke execute on function public.sync_order(jsonb) from public, anon;
revoke execute on function public.cancel_order(uuid, text, timestamptz, uuid, jsonb) from public, anon;
grant execute on function public.sync_order(jsonb) to authenticated;
grant execute on function public.cancel_order(uuid, text, timestamptz, uuid, jsonb) to authenticated;

-- The two sample products whose price depends on size: make them sellable as
-- "price varies" (only if they still have no price, i.e. untouched seed rows).
update public.products
   set is_variable_price = true,
       is_active = true
 where lower(name) in ('pitso / chicken breast', 'hita')
   and selling_price = 0;
