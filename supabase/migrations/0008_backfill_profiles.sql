-- 0008_backfill_profiles.sql
-- Create profiles for auth users that existed before the on_auth_user_created
-- trigger was installed (e.g. the owner account was added in the dashboard
-- before migrations were pushed). If no active admin exists yet, the oldest
-- such user becomes the admin, matching the "first user is admin" rule.
-- Safe to run repeatedly.

with missing as (
  select u.id, u.email, u.raw_user_meta_data, u.created_at
    from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id)
),
promote as (
  select m.id
    from missing m
   where not exists (select 1 from public.profiles p where p.role = 'admin' and p.is_active)
   order by m.created_at
   limit 1
)
insert into public.profiles (id, display_name, role, is_active)
select m.id,
       coalesce(nullif(trim(m.raw_user_meta_data ->> 'display_name'), ''),
                split_part(coalesce(m.email, ''), '@', 1)),
       case when m.id in (select id from promote) then 'admin' else 'cashier' end,
       m.id in (select id from promote)
  from missing m
on conflict (id) do nothing;
