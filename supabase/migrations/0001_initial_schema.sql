-- 0001_initial_schema.sql
-- Core: shared helpers, profiles (roles), devices, settings.
-- Money is always integer centavos. Times are timestamptz.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Role-based access is driven from here.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'cashier'
               check (role in ('admin', 'cashier', 'griller')),
  -- New users cannot do anything until an admin activates them.
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile for every new auth user. The very first user becomes an
-- active admin so the business can bootstrap itself; everyone after that
-- starts inactive until an admin assigns a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('public.profiles.first_admin'));
  select not exists (select 1 from public.profiles) into v_is_first;

  insert into public.profiles (id, display_name, role, is_active)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case when v_is_first then 'admin' else 'cashier' end,
    v_is_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role of the calling user, or NULL if not signed in / inactive.
create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.has_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.user_role() = any (p_roles), false);
$$;

-- Admins may change roles / activation, but never their own (prevents an
-- admin from accidentally locking every admin out).
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id = auth.uid()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'You cannot change your own role or activation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Devices: each phone registers once. id is generated on the device.
-- ---------------------------------------------------------------------------
create table public.devices (
  id          uuid primary key,
  device_code text not null unique,               -- e.g. POS01, GRILL01
  device_name text not null check (length(trim(device_name)) > 0),
  device_type text not null check (device_type in ('cashier', 'griller')),
  last_seen   timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Settings: exactly one row.
-- ---------------------------------------------------------------------------
create table public.settings (
  id               integer primary key default 1 check (id = 1),
  business_name    text not null default 'Ihaw-Ihaw' check (length(trim(business_name)) > 0),
  business_address text,
  business_phone   text,
  updated_at       timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (id) values (1);
