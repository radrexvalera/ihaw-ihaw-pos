-- seed.sql — editable SAMPLE products only. Prices are integer centavos.
-- Unit costs are unknown and seeded as 0: set them in Settings → Products,
-- otherwise the gross profit report will overstate profit.
-- Pitso and Hita are priced by size: "price varies" products — the cashier
-- enters the price at sale, so no selling price is seeded for them.
-- Safe to run more than once.

insert into public.products (name, selling_price, unit_cost, low_stock_threshold, is_active, is_variable_price, sort_order)
values
  ('BBQ',                   2500, 0, 20, true, false,  10),
  ('Liempo',               10000, 0,  5, true, false,  20),
  ('Tenga',                 2000, 0, 10, true, false,  30),
  ('Bulaklak',              2000, 0, 10, true, false,  40),
  ('Isaw Baboy',            2000, 0, 10, true, false,  50),
  ('Isaw Manok',            1000, 0, 10, true, false,  60),
  ('Paa',                   2000, 0, 10, true, false,  70),
  ('Hotdog',                2000, 0, 10, true, false,  80),
  ('Ulo',                   1000, 0, 10, true, false,  90),
  ('Dugo',                  1000, 0, 10, true, false, 100),
  ('Leeg',                  1500, 0, 10, true, false, 110),
  ('Pitso / Chicken Breast',   0, 0,  5, true, true,  120),
  ('Hita',                     0, 0,  5, true, true,  130)
on conflict do nothing;
