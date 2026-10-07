-- 0006_functions.sql
-- RPC write API. Clients never insert/update orders, order_items or
-- inventory_movements directly; they call these SECURITY DEFINER functions,
-- which check the caller's role and are idempotent so the offline outbox can
-- safely retry any call any number of times.

-- ---------------------------------------------------------------------------
-- register_device: upsert this phone; assigns POS01 / GRILL01 style codes.
-- Called on first setup and on every online start (refreshes last_seen).
-- ---------------------------------------------------------------------------
create or replace function public.register_device(
  p_id   uuid,
  p_name text,
  p_type text
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices;
  v_prefix text;
  v_n      integer;
begin
  if public.user_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_type not in ('cashier', 'griller') then
    raise exception 'Invalid device type: %', p_type;
  end if;

  update public.devices
     set device_name = coalesce(nullif(trim(p_name), ''), device_name),
         device_type = p_type,
         last_seen   = now()
   where id = p_id
  returning * into v_device;
  if found then
    return v_device;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.devices.code'));
  v_prefix := case when p_type = 'cashier' then 'POS' else 'GRILL' end;
  select count(*) + 1 into v_n from public.devices where device_code like v_prefix || '%';
  while exists (select 1 from public.devices
                 where device_code = v_prefix || lpad(v_n::text, 2, '0')) loop
    v_n := v_n + 1;
  end loop;

  insert into public.devices (id, device_code, device_name, device_type, last_seen, created_by)
  values (p_id, v_prefix || lpad(v_n::text, 2, '0'),
          coalesce(nullif(trim(p_name), ''), v_prefix || lpad(v_n::text, 2, '0')),
          p_type, now(), auth.uid())
  returning * into v_device;
  return v_device;
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_order: create a completed sale (order + items + SALE movements) in one
-- transaction. Idempotent on the order UUID.
--
-- p_order = {
--   id, order_ref, order_number, business_date, customer_token_number,
--   total, payment_method, payment_reference, amount_received, change_due,
--   change_given, change_given_at, change_given_by,
--   device_id, created_by, created_at,
--   items: [{ id, movement_id, product_id, product_name_snapshot,
--             quantity, unit_price, unit_cost }]
-- }
-- Returns {"result": "created" | "duplicate", "id": ...}
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

  -- Already synced (retry) → success, nothing to do.
  if exists (select 1 from public.orders where id = v_id) then
    return jsonb_build_object('result', 'duplicate', 'id', v_id);
  end if;

  -- Validate before writing anything.
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
    -- Lost a race with a concurrent retry of the same order.
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

  -- One SALE movement per item, using the movement UUID the device generated.
  insert into public.inventory_movements (
    id, product_id, quantity_change, movement_type, reference_id,
    created_at, created_by, device_id
  )
  select x.movement_id, x.product_id, -x.quantity, 'SALE', v_id,
         v_created_at, v_created_by, (p_order ->> 'device_id')::uuid
    from jsonb_to_recordset(v_items) as x(movement_id uuid, product_id uuid, quantity integer)
  on conflict do nothing;

  return jsonb_build_object('result', 'created', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_change_given: idempotent (only flips false → true once).
-- ---------------------------------------------------------------------------
create or replace function public.mark_change_given(
  p_order_id uuid,
  p_given_at timestamptz default now(),
  p_given_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.has_role('admin', 'cashier') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.orders
     set change_given    = true,
         change_given_at = coalesce(p_given_at, now()),
         change_given_by = coalesce(p_given_by, auth.uid())
   where id = p_order_id and not change_given
  returning * into v_order;

  if not found then
    if not exists (select 1 from public.orders where id = p_order_id) then
      raise exception 'Order % not found', p_order_id;
    end if;
    return jsonb_build_object('result', 'unchanged', 'id', p_order_id);
  end if;

  perform public.write_audit('change_marked_given', 'order', p_order_id::text,
    jsonb_build_object('order_ref', v_order.order_ref, 'change_amount', v_order.change_due),
    v_order.change_given_by);
  return jsonb_build_object('result', 'updated', 'id', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_grill_status: forward-only (new → grilling → done). Stale or repeated
-- calls are ignored, so two devices / retries can never move an order back.
-- ---------------------------------------------------------------------------
create or replace function public.grill_status_rank(p_status text)
returns integer
language sql
immutable
as $$
  select case p_status when 'new' then 0 when 'grilling' then 1 when 'done' then 2
                       when 'cancelled' then 3 else -1 end;
$$;

create or replace function public.set_grill_status(
  p_order_id uuid,
  p_status   text,
  p_at       timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin', 'cashier', 'griller') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('grilling', 'done') then
    raise exception 'Invalid grill status: %', p_status;
  end if;

  update public.orders
     set grill_status     = p_status,
         grill_started_at = coalesce(grill_started_at, p_at),
         grill_done_at    = case when p_status = 'done' then p_at else grill_done_at end
   where id = p_order_id
     and status = 'completed'
     and public.grill_status_rank(p_status) > public.grill_status_rank(grill_status);

  if found then
    return jsonb_build_object('result', 'updated', 'id', p_order_id);
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order % not found', p_order_id;
  end if;
  return jsonb_build_object('result', 'unchanged', 'id', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_order: keeps the order, marks it cancelled, returns stock once.
-- p_movement_ids maps product_id → movement UUID generated on the device.
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
         oi.product_id, oi.quantity, 'CANCELLED_SALE_RETURN', p_order_id,
         trim(p_reason), coalesce(p_at, now()), auth.uid(), p_device_id
    from public.order_items oi
   where oi.order_id = p_order_id
  on conflict do nothing;

  perform public.write_audit('sale_cancelled', 'order', p_order_id::text,
    jsonb_build_object('order_ref', v_order.order_ref, 'total', v_order.total,
                       'reason', trim(p_reason),
                       'change_was_pending', not v_order.change_given));
  return jsonb_build_object('result', 'cancelled', 'id', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_stock_movement: opening stock, stock in, adjustments (admin only).
-- Sales and returns go through sync_order / cancel_order instead.
-- p = { id, product_id, quantity_change, movement_type, reason, created_at, device_id }
-- ---------------------------------------------------------------------------
create or replace function public.record_stock_movement(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := p ->> 'movement_type';
  v_rows integer;
begin
  if not public.has_role('admin') then
    raise exception 'Only an admin can change stock' using errcode = '42501';
  end if;
  if v_type not in ('OPENING', 'STOCK_IN', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS') then
    raise exception 'Invalid movement type: %', v_type;
  end if;

  insert into public.inventory_movements (
    id, product_id, quantity_change, movement_type, reason,
    created_at, created_by, device_id
  ) values (
    (p ->> 'id')::uuid,
    (p ->> 'product_id')::uuid,
    (p ->> 'quantity_change')::integer,
    v_type,
    nullif(trim(coalesce(p ->> 'reason', '')), ''),
    coalesce((p ->> 'created_at')::timestamptz, now()),
    auth.uid(),
    (p ->> 'device_id')::uuid
  )
  on conflict (id) do nothing;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('result', case when v_rows = 0 then 'duplicate' else 'created' end,
                            'id', p ->> 'id');
end;
$$;

-- ---------------------------------------------------------------------------
-- set_product_sold_out: quick toggle for cashiers (they cannot edit products).
-- ---------------------------------------------------------------------------
create or replace function public.set_product_sold_out(
  p_product_id uuid,
  p_sold_out   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin', 'cashier') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.products
     set is_sold_out = p_sold_out
   where id = p_product_id and is_sold_out is distinct from p_sold_out;

  if found then
    return jsonb_build_object('result', 'updated', 'id', p_product_id);
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product % not found', p_product_id;
  end if;
  return jsonb_build_object('result', 'unchanged', 'id', p_product_id);
end;
$$;
