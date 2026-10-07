-- seed.sql — editable SAMPLE products only. Prices are integer centavos.
-- Unit costs are unknown and seeded as 0: set them in Settings → Products,
-- otherwise the gross profit report will overstate profit.
-- Pitso and Hita have no known price yet, so they start DISABLED (price 0)
-- until the owner sets a price and enables them.
-- Safe to run more than once.

insert into public.products (name, selling_price, unit_cost, low_stock_threshold, is_active, sort_order)
values
  ('BBQ',                   2500, 0, 20, true,  10),
  ('Liempo',               10000, 0,  5, true,  20),
  ('Tenga',                 2000, 0, 10, true,  30),
  ('Bulaklak',              2000, 0, 10, true,  40),
  ('Isaw Baboy',            2000, 0, 10, true,  50),
  ('Isaw Manok',            1000, 0, 10, true,  60),
  ('Paa',                   2000, 0, 10, true,  70),
  ('Hotdog',                2000, 0, 10, true,  80),
  ('Ulo',                   1000, 0, 10, true,  90),
  ('Dugo',                  1000, 0, 10, true, 100),
  ('Leeg',                  1500, 0, 10, true, 110),
  ('Pitso / Chicken Breast',   0, 0,  5, false, 120),
  ('Hita',                     0, 0,  5, false, 130)
on conflict do nothing;
