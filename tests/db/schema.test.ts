import { beforeAll, describe, expect, it } from 'vitest'
import { buildSale, syncOrderPayload } from '../../src/pos/checkout'
import { as, createDb, createUser, rpc, scalar, setProfile, type Db } from './harness'

const ADMIN = '00000000-0000-4000-8000-00000000000a'
const CASHIER = '00000000-0000-4000-8000-00000000000c'
const GRILLER = '00000000-0000-4000-8000-00000000000f'
const STRANGER = '00000000-0000-4000-8000-0000000000ee'
const POS_DEVICE = '10000000-0000-4000-8000-000000000001'
const GRILL_DEVICE = '10000000-0000-4000-8000-000000000002'

let db: Db
let bbqId: string
let liempoId: string

function uuid(): string {
  return crypto.randomUUID()
}

function orderPayload(overrides: Record<string, unknown> = {}) {
  const id = uuid()
  return {
    id,
    order_ref: 'POS01-20261007-0001',
    order_number: 1,
    business_date: '2026-10-07',
    customer_token_number: null,
    total: 17500, // 3 × 25 + 1 × 100
    payment_method: 'cash',
    payment_reference: null,
    amount_received: 50000,
    change_due: 32500,
    change_given: false,
    device_id: POS_DEVICE,
    created_by: CASHIER,
    created_at: '2026-10-07T10:00:00+08:00',
    items: [
      {
        id: uuid(),
        movement_id: uuid(),
        product_id: bbqId,
        product_name_snapshot: 'BBQ',
        quantity: 3,
        unit_price: 2500,
        unit_cost: 1400,
      },
      {
        id: uuid(),
        movement_id: uuid(),
        product_id: liempoId,
        product_name_snapshot: 'Liempo',
        quantity: 1,
        unit_price: 10000,
        unit_cost: 6000,
      },
    ],
    ...overrides,
  }
}

const stockOf = (id: string) =>
  scalar<number>(db, 'select stock_quantity from products where id = $1', [id])

async function syncOrder(user: string, payload: unknown) {
  return as(db, user, (tx) => rpc<{ result: string }>(tx, 'public.sync_order($1::jsonb)', [JSON.stringify(payload)]))
}

beforeAll(async () => {
  db = await createDb()
  await createUser(db, ADMIN, 'owner@example.com')
  await createUser(db, CASHIER, 'cashier@example.com')
  await createUser(db, GRILLER, 'griller@example.com')
  await createUser(db, STRANGER, 'stranger@example.com')
  await setProfile(db, CASHIER, 'cashier')
  await setProfile(db, GRILLER, 'griller')
  bbqId = await scalar(db, `select id from products where name = 'BBQ'`)
  liempoId = await scalar(db, `select id from products where name = 'Liempo'`)

  await as(db, ADMIN, async (tx) => {
    await rpc(tx, `public.register_device($1, 'Cashier phone', 'cashier')`, [POS_DEVICE])
    await rpc(tx, `public.register_device($1, 'Grill phone', 'griller')`, [GRILL_DEVICE])
    for (const id of [bbqId, liempoId]) {
      await rpc(tx, 'public.record_stock_movement($1::jsonb)', [
        JSON.stringify({ id: uuid(), product_id: id, quantity_change: 100, movement_type: 'OPENING' }),
      ])
    }
    await tx.query(`update products set unit_cost = 1400 where id = $1`, [bbqId])
  })
})

describe('migrations and seed', () => {
  it('seeds the sample products, with size-priced items as "price varies"', async () => {
    expect(await scalar<number>(db, 'select count(*)::int from products')).toBe(13)
    const pitso = await db.query<{ selling_price: number; is_active: boolean; is_variable_price: boolean }>(
      `select selling_price, is_active, is_variable_price from products where name like 'Pitso%'`,
    )
    expect(pitso.rows[0]).toEqual({ selling_price: 0, is_active: true, is_variable_price: true })
  })

  it('seed is safe to run twice', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    await db.exec(readFileSync(join(import.meta.dirname, '../../supabase/seed.sql'), 'utf8'))
    expect(await scalar<number>(db, 'select count(*)::int from products')).toBe(13)
  })

  it('makes the first user an active admin and later users inactive cashiers', async () => {
    const rows = await db.query<{ id: string; role: string; is_active: boolean }>(
      'select id, role, is_active from profiles where id in ($1, $2)',
      [ADMIN, STRANGER],
    )
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]))
    expect(byId[ADMIN]).toMatchObject({ role: 'admin', is_active: true })
    expect(byId[STRANGER]).toMatchObject({ role: 'cashier', is_active: false })
  })
})

describe('profile backfill (users created before migrations)', () => {
  it('creates missing profiles, making the oldest the admin', async () => {
    const early = await createDb({
      beforeMigrations: async (d) => {
        await d.query(`insert into auth.users (id, email) values ($1, 'owner@example.com')`, [ADMIN])
        await d.query(`insert into auth.users (id, email) values ($1, 'cashier@example.com')`, [CASHIER])
      },
    })
    const rows = await early.query<{ id: string; role: string; is_active: boolean }>(
      'select id, role, is_active from profiles order by role',
    )
    expect(rows.rows).toEqual([
      { id: ADMIN, role: 'admin', is_active: true },
      { id: CASHIER, role: 'cashier', is_active: false },
    ])
    await early.close()
  })
})

describe('row level security', () => {
  it('anon and inactive users see no products', async () => {
    expect(await as(db, STRANGER, (tx) => scalar<number>(tx, 'select count(*)::int from products'))).toBe(0)
    await expect(as(db, null, (tx) => tx.query('select * from products'))).rejects.toThrow(/permission denied/)
  })

  it('cashier can read products but not change them', async () => {
    expect(await as(db, CASHIER, (tx) => scalar<number>(tx, 'select count(*)::int from products'))).toBe(13)
    await expect(
      as(db, CASHIER, (tx) => tx.query(`insert into products (name) values ('Hack')`)),
    ).rejects.toThrow(/row-level security/)
    const updated = await as(db, CASHIER, (tx) =>
      tx.query(`update products set selling_price = 1 where id = $1`, [bbqId]),
    )
    expect(updated.affectedRows).toBe(0)
  })

  it('nobody can write orders directly', async () => {
    await expect(
      as(db, ADMIN, (tx) => tx.query(`delete from orders`)),
    ).rejects.toThrow(/permission denied/)
  })

  it('stock_quantity cannot be set directly, even by an admin', async () => {
    await expect(
      as(db, ADMIN, (tx) => tx.query(`update products set stock_quantity = 999 where id = $1`, [bbqId])),
    ).rejects.toThrow(/inventory movements/)
  })

  it('admins cannot change their own role', async () => {
    await expect(
      as(db, ADMIN, (tx) => tx.query(`update profiles set role = 'cashier' where id = $1`, [ADMIN])),
    ).rejects.toThrow(/your own role/)
  })

  it('price and cost changes are audited', async () => {
    await as(db, ADMIN, (tx) => tx.query(`update products set selling_price = 2600 where id = $1`, [bbqId]))
    await as(db, ADMIN, (tx) => tx.query(`update products set selling_price = 2500 where id = $1`, [bbqId]))
    const n = await scalar<number>(
      db,
      `select count(*)::int from audit_logs where action = 'product_price_changed' and entity_id = $1`,
      [bbqId],
    )
    expect(n).toBe(2)
  })
})

describe('devices', () => {
  it('assigns readable codes and re-registering is idempotent', async () => {
    const again = await as(db, CASHIER, (tx) =>
      scalar<string>(tx, `select device_code from public.register_device($1, 'Cashier phone', 'cashier')`, [POS_DEVICE]),
    )
    expect(again).toBe('POS01')
    const codes = await db.query<{ device_code: string }>('select device_code from devices order by device_code')
    expect(codes.rows.map((r) => r.device_code)).toEqual(['GRILL01', 'POS01'])
  })
})

describe('sync_order', () => {
  it('creates the order, items and SALE movements, deducting stock once', async () => {
    const before = await stockOf(bbqId)
    const order = orderPayload()
    expect((await syncOrder(CASHIER, order)).result).toBe('created')
    expect(await stockOf(bbqId)).toBe(before - 3)

    // Retry the exact same order (e.g. app killed before the ack arrived).
    expect((await syncOrder(CASHIER, order)).result).toBe('duplicate')
    expect((await syncOrder(CASHIER, order)).result).toBe('duplicate')
    expect(await stockOf(bbqId)).toBe(before - 3)
    expect(await scalar<number>(db, 'select count(*)::int from order_items where order_id = $1', [order.id])).toBe(2)
    expect(
      await scalar<number>(db, 'select count(*)::int from inventory_movements where reference_id = $1', [order.id]),
    ).toBe(2)
  })

  it('records change pending and grill status NEW independently', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    const row = await db.query<Record<string, unknown>>(
      'select change_due, change_given, grill_status, status from orders where id = $1',
      [order.id],
    )
    expect(row.rows[0]).toEqual({ change_due: 32500, change_given: false, grill_status: 'new', status: 'completed' })
  })

  it('rejects a total that does not match the items, writing nothing', async () => {
    const before = await stockOf(bbqId)
    const bad = orderPayload({ total: 100, change_due: 49900 })
    await expect(syncOrder(CASHIER, bad)).rejects.toThrow(/does not match/)
    expect(await stockOf(bbqId)).toBe(before)
    expect(await scalar<number>(db, 'select count(*)::int from orders where id = $1', [bad.id])).toBe(0)
  })

  it('rejects wrong change and short payment', async () => {
    await expect(syncOrder(CASHIER, orderPayload({ change_due: 1 }))).rejects.toThrow(/Change due/)
    await expect(
      syncOrder(CASHIER, orderPayload({ amount_received: 100, change_due: -17400 })),
    ).rejects.toThrow(/less than total/)
  })

  it('griller cannot create sales', async () => {
    await expect(syncOrder(GRILLER, orderPayload())).rejects.toThrow(/Not allowed/)
  })

  it('a different movement UUID for the same order+product still cannot deduct twice', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    const before = await stockOf(bbqId)
    await expect(
      as(db, ADMIN, (tx) =>
        tx.query(
          `insert into inventory_movements (id, product_id, quantity_change, movement_type, reference_id, created_at)
           values ($1, $2, -3, 'SALE', $3, now())`,
          [uuid(), bbqId, order.id],
        ),
      ),
    ).rejects.toThrow()
    expect(await stockOf(bbqId)).toBe(before)
  })

  it('keeps the unit cost and price snapshot when the product changes later', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    await as(db, ADMIN, (tx) => tx.query('update products set unit_cost = 1600, selling_price = 3000 where id = $1', [bbqId]))
    const item = await db.query<{ unit_cost: number; unit_price: number }>(
      'select unit_cost, unit_price from order_items where order_id = $1 and product_id = $2',
      [order.id, bbqId],
    )
    expect(item.rows[0]).toEqual({ unit_cost: 1400, unit_price: 2500 })
    await as(db, ADMIN, (tx) => tx.query('update products set unit_cost = 1400, selling_price = 2500 where id = $1', [bbqId]))
  })
})

describe('mark_change_given', () => {
  it('flips once, records who and when, and audits once', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    const call = () =>
      as(db, CASHIER, (tx) =>
        rpc<{ result: string }>(tx, `public.mark_change_given($1, '2026-10-07T10:05:00+08:00', $2)`, [order.id, CASHIER]),
      )
    expect((await call()).result).toBe('updated')
    expect((await call()).result).toBe('unchanged')
    const row = await db.query<{ change_given: boolean; change_given_by: string }>(
      'select change_given, change_given_by from orders where id = $1',
      [order.id],
    )
    expect(row.rows[0]).toEqual({ change_given: true, change_given_by: CASHIER })
    expect(
      await scalar<number>(db, `select count(*)::int from audit_logs where action = 'change_marked_given' and entity_id = $1`, [order.id]),
    ).toBe(1)
  })
})

describe('set_grill_status', () => {
  it('moves forward only and ignores stale updates', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    const set = (status: string) =>
      as(db, GRILLER, (tx) => rpc<{ result: string }>(tx, 'public.set_grill_status($1, $2)', [order.id, status]))
    expect((await set('grilling')).result).toBe('updated')
    expect((await set('grilling')).result).toBe('unchanged')
    expect((await set('done')).result).toBe('updated')
    expect((await set('grilling')).result).toBe('unchanged')
    expect(await scalar(db, 'select grill_status from orders where id = $1', [order.id])).toBe('done')
  })
})

describe('cancel_order', () => {
  it('keeps the order, returns stock exactly once, and is admin only', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    const afterSale = await stockOf(bbqId)

    await expect(
      as(db, CASHIER, (tx) => rpc(tx, `public.cancel_order($1, 'Wrong order')`, [order.id])),
    ).rejects.toThrow(/Only an admin/)

    const movementIds = JSON.stringify({ [bbqId]: uuid(), [liempoId]: uuid() })
    const cancel = () =>
      as(db, ADMIN, (tx) =>
        rpc<{ result: string }>(tx, `public.cancel_order($1, 'Customer left', now(), $2, $3::jsonb)`, [
          order.id,
          POS_DEVICE,
          movementIds,
        ]),
      )
    expect((await cancel()).result).toBe('cancelled')
    expect((await cancel()).result).toBe('already_cancelled')
    expect(await stockOf(bbqId)).toBe(afterSale + 3)

    const row = await db.query<Record<string, unknown>>(
      'select status, grill_status, cancellation_reason from orders where id = $1',
      [order.id],
    )
    expect(row.rows[0]).toEqual({ status: 'cancelled', grill_status: 'cancelled', cancellation_reason: 'Customer left' })
  })

  it('requires a reason', async () => {
    const order = orderPayload()
    await syncOrder(CASHIER, order)
    await expect(as(db, ADMIN, (tx) => rpc(tx, `public.cancel_order($1, '  ')`, [order.id]))).rejects.toThrow(/reason/)
  })
})

describe('record_stock_movement', () => {
  it('is idempotent on the movement id', async () => {
    const before = await stockOf(liempoId)
    const movement = JSON.stringify({ id: uuid(), product_id: liempoId, quantity_change: 50, movement_type: 'STOCK_IN' })
    const call = () => as(db, ADMIN, (tx) => rpc<{ result: string }>(tx, 'public.record_stock_movement($1::jsonb)', [movement]))
    expect((await call()).result).toBe('created')
    expect((await call()).result).toBe('duplicate')
    expect(await stockOf(liempoId)).toBe(before + 50)
  })

  it('requires a reason for adjustments and rejects cashiers', async () => {
    const adj = (reason: string | null) =>
      JSON.stringify({ id: uuid(), product_id: liempoId, quantity_change: -3, movement_type: 'ADJUSTMENT_MINUS', reason })
    await expect(as(db, ADMIN, (tx) => rpc(tx, 'public.record_stock_movement($1::jsonb)', [adj(null)]))).rejects.toThrow()
    await expect(as(db, CASHIER, (tx) => rpc(tx, 'public.record_stock_movement($1::jsonb)', [adj('Damaged')]))).rejects.toThrow(
      /Only an admin/,
    )
    const before = await stockOf(liempoId)
    await as(db, ADMIN, (tx) => rpc(tx, 'public.record_stock_movement($1::jsonb)', [adj('Damaged')]))
    expect(await stockOf(liempoId)).toBe(before - 3)
  })

  it('stock always equals the sum of the ledger', async () => {
    const mismatches = await scalar<number>(
      db,
      `select count(*)::int from products p
        where p.stock_quantity <> coalesce((select sum(quantity_change) from inventory_movements m where m.product_id = p.id), 0)`,
    )
    expect(mismatches).toBe(0)
  })

  it('the ledger is append-only', async () => {
    await expect(db.query('delete from inventory_movements')).rejects.toThrow(/append-only/)
  })
})

describe('set_product_sold_out', () => {
  it('lets a cashier toggle availability and audits it', async () => {
    const call = (v: boolean) =>
      as(db, CASHIER, (tx) => rpc<{ result: string }>(tx, 'public.set_product_sold_out($1, $2)', [liempoId, v]))
    expect((await call(true)).result).toBe('updated')
    expect((await call(true)).result).toBe('unchanged')
    expect((await call(false)).result).toBe('updated')
    expect(
      await scalar<number>(db, `select count(*)::int from audit_logs where entity_id = $1 and action like 'product_marked_%'`, [liempoId]),
    ).toBe(2)
  })

  it('griller cannot toggle availability', async () => {
    await expect(
      as(db, GRILLER, (tx) => rpc(tx, 'public.set_product_sold_out($1, true)', [liempoId])),
    ).rejects.toThrow(/Not allowed/)
  })
})

describe('client ↔ server contract', () => {
  it('the payload the app builds is accepted by sync_order, idempotently', async () => {
    const before = await stockOf(bbqId)
    const { order } = buildSale({
      cart: [
        { line_key: bbqId, variable_price: false, product_id: bbqId, name: 'BBQ', unit_price: 2500, unit_cost: 1400, quantity: 3 },
        { line_key: liempoId, variable_price: false, product_id: liempoId, name: 'Liempo', unit_price: 10000, unit_cost: 6000, quantity: 1 },
      ],
      paymentMethod: 'cash',
      amountReceived: 50000,
      paymentReference: null,
      customerToken: 12,
      device: { id: POS_DEVICE, device_code: 'POS01' },
      userId: CASHIER,
      businessDate: '2026-10-07',
      orderNumber: 27,
      now: new Date(),
      uuid: () => crypto.randomUUID(),
    })
    const payload = syncOrderPayload(order)
    expect((await syncOrder(CASHIER, payload)).result).toBe('created')
    expect((await syncOrder(CASHIER, payload)).result).toBe('duplicate')
    expect(await stockOf(bbqId)).toBe(before - 3)
    const row = await db.query<Record<string, unknown>>(
      'select order_number, customer_token_number, change_due, change_given, total from orders where id = $1',
      [order.id],
    )
    expect(row.rows[0]).toEqual({ order_number: 27, customer_token_number: 12, change_due: 32500, change_given: false, total: 17500 })
  })
})

describe('security hardening', () => {
  it('every public function pins its search_path', async () => {
    const rows = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')`,
    )
    expect(rows.rows.map((r) => r.proname)).toEqual([])
  })

  it('every public table has RLS enabled', async () => {
    const rows = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows.rows).toEqual([])
  })

  it('signed-in users can call only the RPC API', async () => {
    const rows = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`,
    )
    expect(rows.rows.map((r) => r.proname)).toEqual([
      'cancel_order',
      'grill_status_rank',
      'has_role',
      'mark_change_given',
      'record_stock_movement',
      'register_device',
      'set_grill_status',
      'set_product_sold_out',
      'sync_order',
      'user_role',
    ])
  })

  it('audit log is admin-only', async () => {
    expect(await as(db, CASHIER, (tx) => scalar<number>(tx, 'select count(*)::int from audit_logs'))).toBe(0)
    expect(await as(db, ADMIN, (tx) => scalar<number>(tx, 'select count(*)::int from audit_logs'))).toBeGreaterThan(0)
  })
})

describe('price varies (same product at different prices in one order)', () => {
  it('stores one line per price, deducts and returns stock once per product', async () => {
    const pitsoId = await scalar<string>(db, `select id from products where name like 'Pitso%'`)
    await as(db, ADMIN, (tx) =>
      rpc(tx, 'public.record_stock_movement($1::jsonb)', [
        JSON.stringify({ id: uuid(), product_id: pitsoId, quantity_change: 20, movement_type: 'STOCK_IN' }),
      ]),
    )
    const before = await stockOf(pitsoId)
    const movementId = uuid()
    const order = orderPayload({
      total: 9000 + 2 * 13000,
      amount_received: 50000,
      change_due: 50000 - 35000,
      items: [
        { id: uuid(), movement_id: movementId, product_id: pitsoId, product_name_snapshot: 'Pitso', quantity: 1, unit_price: 9000, unit_cost: 6000 },
        { id: uuid(), movement_id: movementId, product_id: pitsoId, product_name_snapshot: 'Pitso', quantity: 2, unit_price: 13000, unit_cost: 6000 },
      ],
    })
    expect((await syncOrder(CASHIER, order)).result).toBe('created')
    expect((await syncOrder(CASHIER, order)).result).toBe('duplicate')
    expect(await stockOf(pitsoId)).toBe(before - 3)
    expect(await scalar<number>(db, 'select count(*)::int from order_items where order_id = $1', [order.id])).toBe(2)
    expect(await scalar<number>(db, 'select count(*)::int from inventory_movements where reference_id = $1', [order.id])).toBe(1)

    await as(db, ADMIN, (tx) => rpc(tx, `public.cancel_order($1, 'Wrong size', now(), $2, $3::jsonb)`, [order.id, POS_DEVICE, JSON.stringify({ [pitsoId]: uuid() })]))
    expect(await stockOf(pitsoId)).toBe(before)
  })

  it('rejects items of one product with different movement ids (would under-deduct)', async () => {
    const pitsoId = await scalar<string>(db, `select id from products where name like 'Pitso%'`)
    const bad = orderPayload({
      total: 9000 + 13000,
      amount_received: 22000,
      change_due: 0,
      items: [
        { id: uuid(), movement_id: uuid(), product_id: pitsoId, product_name_snapshot: 'Pitso', quantity: 1, unit_price: 9000, unit_cost: 0 },
        { id: uuid(), movement_id: uuid(), product_id: pitsoId, product_name_snapshot: 'Pitso', quantity: 1, unit_price: 13000, unit_cost: 0 },
      ],
    })
    await expect(syncOrder(CASHIER, bad)).rejects.toThrow(/one movement id/)
  })
})
