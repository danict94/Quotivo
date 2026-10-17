create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  access_level text not null check (access_level in ('FREE', 'PRO', 'FOUNDER', 'ADMIN_GIFT', 'INTERNAL')),
  source text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (ends_at is null or ends_at >= starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create table public.entitlement_grant_audit (
  id bigint generated always as identity primary key,
  grant_id uuid,
  user_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid,
  actor_database_role text not null,
  recorded_at timestamptz not null default now(),
  reason text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.entitlement_grants enable row level security;
alter table public.entitlement_grant_audit enable row level security;

create policy "Users can read their own entitlement grants"
  on public.entitlement_grants for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.entitlement_grants from anon, authenticated;
grant select on public.entitlement_grants to authenticated;
revoke all on public.entitlement_grant_audit from anon, authenticated;

create or replace function public.audit_entitlement_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.entitlement_grant_audit (grant_id, user_id, action, actor_user_id, actor_database_role, reason, metadata)
  values (
    coalesce(new.id, old.id), coalesce(new.user_id, old.user_id), tg_op, auth.uid(), session_user,
    coalesce(new.metadata ->> 'reason', old.metadata ->> 'reason'),
    jsonb_build_object('access_level', coalesce(new.access_level, old.access_level), 'source', coalesce(new.source, old.source))
  );
  return null;
end;
$$;

create trigger entitlement_grants_audit
  after insert or update or delete on public.entitlement_grants
  for each row execute function public.audit_entitlement_grant();

insert into public.entitlement_grants (user_id, access_level, source, starts_at, ends_at, revoked_at, created_at, updated_at)
select user_id, plan, source, valid_from, valid_until,
  case when status = 'ACTIVE' then null else updated_at end, created_at, updated_at
from public.entitlements
on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.entitlements (user_id, plan, source, status)
  values (new.id, 'FREE', 'SIGNUP', 'ACTIVE') on conflict (user_id) do nothing;
  insert into public.entitlement_grants (user_id, access_level, source, metadata)
  values (new.id, 'FREE', 'SIGNUP', '{"reason":"automatic signup"}'::jsonb);
  return new;
end;
$$;
