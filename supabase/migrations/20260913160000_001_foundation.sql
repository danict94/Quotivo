create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'FREE' check (plan in ('FREE', 'PRO', 'FOUNDER', 'ADMIN_GIFT', 'INTERNAL')),
  source text not null default 'SIGNUP',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.app_config enable row level security;

create policy "Users can read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read their entitlement"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Clients can read app config"
  on public.app_config for select to anon, authenticated
  using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.entitlements (user_id, plan, source, status)
  values (new.id, 'FREE', 'SIGNUP', 'ACTIVE')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.app_config (key, value)
values
  ('min_supported_version', '"0.1.0"'::jsonb),
  ('latest_version', '"0.1.0"'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('offline_grace_days', '7'::jsonb),
  ('feature_flags', '{}'::jsonb)
on conflict (key) do nothing;
