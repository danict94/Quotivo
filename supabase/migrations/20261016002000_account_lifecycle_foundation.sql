-- Account lifecycle is the single server-side source of truth for account availability.
create table public.account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DEACTIVATED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  reactivated_at timestamptz,
  check ((status = 'ACTIVE' and deactivated_at is null) or (status = 'DEACTIVATED' and deactivated_at is not null))
);

insert into public.account_lifecycle (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

alter table public.account_lifecycle enable row level security;
revoke all on public.account_lifecycle from anon, authenticated;
grant select on public.account_lifecycle to authenticated;
create policy "users read own account lifecycle"
  on public.account_lifecycle for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.assert_account_active(p_user_id uuid default auth.uid())
returns text
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select lifecycle.status into v_status from public.account_lifecycle lifecycle where lifecycle.user_id = p_user_id;
  if v_status is null then raise exception 'ACCOUNT_LIFECYCLE_MISSING' using errcode = '23514'; end if;
  if v_status <> 'ACTIVE' then raise exception 'ACCOUNT_DEACTIVATED' using errcode = 'P0001'; end if;
  return v_status;
end;
$$;

create or replace function public.get_account_lifecycle()
returns table(status text, deactivated_at timestamptz, reactivated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  return query select lifecycle.status, lifecycle.deactivated_at, lifecycle.reactivated_at
    from public.account_lifecycle lifecycle where lifecycle.user_id = v_user_id;
end;
$$;

create or replace function public.set_account_lifecycle(p_status text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_status text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_status not in ('ACTIVE', 'DEACTIVATED') then raise exception 'INVALID_ACCOUNT_LIFECYCLE_STATUS' using errcode = '22023'; end if;
  insert into public.account_lifecycle(user_id) values(v_user_id) on conflict (user_id) do nothing;
  update public.account_lifecycle lifecycle
    set status = p_status,
        deactivated_at = case when p_status = 'DEACTIVATED' then coalesce(lifecycle.deactivated_at, now()) else null end,
        reactivated_at = case when p_status = 'ACTIVE' and lifecycle.status = 'DEACTIVATED' then now() else lifecycle.reactivated_at end,
        updated_at = now()
    where lifecycle.user_id = v_user_id and lifecycle.status is distinct from p_status;
  select lifecycle.status into v_status from public.account_lifecycle lifecycle where lifecycle.user_id = v_user_id;
  return v_status;
end;
$$;

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their active profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id and public.assert_account_active(auth.uid()) = 'ACTIVE')
  with check ((select auth.uid()) = id and public.assert_account_active(auth.uid()) = 'ACTIVE');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.entitlements (user_id, plan, source, status)
    values (new.id, 'FREE', 'SIGNUP', 'ACTIVE') on conflict (user_id) do nothing;
  insert into public.account_lifecycle (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.initialize_quote_sequence(p_year integer, p_last_number integer default 0)
returns table(year integer, last_number integer, next_number integer)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.assert_account_active();
  if p_year <> extract(year from now())::integer or p_last_number < 0 then raise exception 'INVALID_SEQUENCE'; end if;
  insert into public.quote_number_sequences(owner_user_id, year, series_key, last_number)
    values(uid, p_year, 'MAIN', p_last_number) on conflict on constraint quote_number_sequences_pkey do nothing;
  return query select s.year, s.last_number, s.last_number + 1 from public.quote_number_sequences s
    where s.owner_user_id = uid and s.year = p_year and s.series_key = 'MAIN';
end;
$$;

create or replace function public.advance_quote_sequence(p_year integer, p_last_number integer)
returns table(year integer, last_number integer, next_number integer)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.assert_account_active();
  update public.quote_number_sequences s set last_number = p_last_number, updated_at = now()
    where s.owner_user_id = uid and s.year = p_year and s.series_key = 'MAIN' and p_last_number > s.last_number;
  if not found then raise exception 'SEQUENCE_NOT_ADVANCED'; end if;
  return query select s.year, s.last_number, s.last_number + 1 from public.quote_number_sequences s
    where s.owner_user_id = uid and s.year = p_year and s.series_key = 'MAIN';
end;
$$;

create or replace function public.authorize_quote_issue(stable_quote_id text)
returns table(authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer, sequence_number integer, year integer, display_number text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_user_id uuid := auth.uid(); v_existing public.quote_issuances%rowtype; v_count integer := 0; v_is_pro boolean := false; v_year integer := extract(year from now())::integer; v_number integer; v_display text; v_month timestamptz := date_trunc('month', now());
begin
  perform public.assert_account_active();
  if authorize_quote_issue.stable_quote_id is null or length(trim(authorize_quote_issue.stable_quote_id)) not between 1 and 200 then raise exception 'INVALID_QUOTE_ID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select q.* into v_existing from public.quote_issuances q where q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_issue.stable_quote_id) limit 1;
  select count(*)::integer into v_count from public.quote_issuances q where q.user_id = v_user_id and q.issued_at >= v_month and q.revision_number = 0;
  select exists(select 1 from public.entitlement_grants g where g.user_id = v_user_id and g.access_level = 'PRO' and g.starts_at <= now() and (g.ends_at is null or g.ends_at >= now()) and g.revoked_at is null) into v_is_pro;
  if v_existing.id is not null then
    if v_existing.sequence_number is null or v_existing.sequence_year is null or v_existing.display_number is null then raise exception 'ISSUANCE_CANONICAL_NUMBER_MISSING' using errcode = '23514'; end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_count, case when v_is_pro then null else 3 end, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number; return;
  end if;
  if not v_is_pro and v_count >= 3 then return query select false, 'QUOTA_EXCEEDED', null::uuid, v_count, 3, null::integer, v_year, null::text; return; end if;
  if not exists(select 1 from public.quote_number_sequences s where s.owner_user_id = v_user_id and s.year = v_year and s.series_key = 'MAIN') then return query select false, 'SEQUENCE_UNINITIALIZED', null::uuid, v_count, case when v_is_pro then null else 3 end, null::integer, v_year, null::text; return; end if;
  update public.quote_number_sequences s set last_number = s.last_number + 1, updated_at = now() where s.owner_user_id = v_user_id and s.year = v_year and s.series_key = 'MAIN' returning s.last_number into v_number;
  if v_number is null then raise exception 'SEQUENCE_ALLOCATION_FAILED' using errcode = '23514'; end if;
  v_display := v_number::text || '/' || v_year::text;
  insert into public.quote_issuances(user_id, client_quote_id, sequence_year, sequence_number, series_key, display_number) values(v_user_id, trim(authorize_quote_issue.stable_quote_id), v_year, v_number, 'MAIN', v_display) returning * into v_existing;
  return query select true, 'AUTHORIZED', v_existing.id, v_count + 1, case when v_is_pro then null else 3 end, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
end;
$$;

create or replace function public.authorize_quote_revision_issue(stable_quote_id text, root_issuance_id uuid, parent_issuance_id uuid, root_client_quote_id text, parent_client_quote_id text, requested_revision_number integer)
returns table(authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer, sequence_number integer, year integer, display_number text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_user_id uuid := auth.uid(); v_existing public.quote_issuances%rowtype; v_root public.quote_issuances%rowtype; v_parent public.quote_issuances%rowtype; v_count integer := 0;
begin
  perform public.assert_account_active();
  if authorize_quote_revision_issue.stable_quote_id is null or length(trim(authorize_quote_revision_issue.stable_quote_id)) not between 1 and 200 or authorize_quote_revision_issue.root_issuance_id is null or authorize_quote_revision_issue.parent_issuance_id is null or authorize_quote_revision_issue.root_client_quote_id is null or authorize_quote_revision_issue.parent_client_quote_id is null or authorize_quote_revision_issue.requested_revision_number is null or authorize_quote_revision_issue.requested_revision_number < 1 then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select count(*)::integer into v_count from public.quote_issuances q where q.user_id = v_user_id and q.issued_at >= date_trunc('month', now()) and q.revision_number = 0;
  select q.* into v_existing from public.quote_issuances q where q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.stable_quote_id) limit 1;
  if v_existing.id is not null then
    if v_existing.revision_root_issuance_id <> authorize_quote_revision_issue.root_issuance_id or v_existing.parent_issuance_id <> authorize_quote_revision_issue.parent_issuance_id or v_existing.revision_number <> authorize_quote_revision_issue.requested_revision_number then raise exception 'ISSUANCE_CONTEXT_MISMATCH' using errcode = '23514'; end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_count, 3, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number; return;
  end if;
  select q.* into v_root from public.quote_issuances q where q.id = authorize_quote_revision_issue.root_issuance_id and q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.root_client_quote_id) and q.revision_number = 0;
  if v_root.id is null or v_root.sequence_number is null or v_root.sequence_year is null or v_root.display_number is null then raise exception 'INVALID_REVISION_ROOT' using errcode = '23514'; end if;
  select q.* into v_parent from public.quote_issuances q where q.id = authorize_quote_revision_issue.parent_issuance_id and q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.parent_client_quote_id);
  if v_parent.id is null or v_parent.revision_number <> authorize_quote_revision_issue.requested_revision_number - 1 or (v_parent.id <> v_root.id and v_parent.revision_root_issuance_id <> v_root.id) then raise exception 'INVALID_REVISION_PARENT' using errcode = '23514'; end if;
  if exists(select 1 from public.quote_issuances q where q.user_id = v_user_id and q.parent_issuance_id = v_parent.id) then return query select false, 'REVISION_PARENT_NOT_LATEST', null::uuid, v_count, 3, v_root.sequence_number, v_root.sequence_year, v_root.display_number; return; end if;
  if exists(select 1 from public.quote_issuances q where q.user_id = v_user_id and q.revision_root_issuance_id = v_root.id and q.revision_number = authorize_quote_revision_issue.requested_revision_number) then return query select false, 'REVISION_ALREADY_EXISTS', null::uuid, v_count, 3, v_root.sequence_number, v_root.sequence_year, v_root.display_number; return; end if;
  insert into public.quote_issuances(user_id, client_quote_id, sequence_year, sequence_number, series_key, display_number, revision_root_issuance_id, parent_issuance_id, revision_number) values(v_user_id, trim(authorize_quote_revision_issue.stable_quote_id), v_root.sequence_year, v_root.sequence_number, v_root.series_key, v_root.display_number, v_root.id, v_parent.id, authorize_quote_revision_issue.requested_revision_number) returning * into v_existing;
  return query select true, 'AUTHORIZED', v_existing.id, v_count, 3, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
end;
$$;

create or replace function public.create_quote_share_secure(p_issuance_id uuid, p_snapshot_payload jsonb, p_token_hash text, p_token_ciphertext text)
returns table(share_id uuid, issuance_id uuid, version integer, lifecycle text, commercial_outcome text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); snapshot_id uuid; snapshot_version integer; created_share_id uuid; canonical_display text;
begin
  perform public.assert_account_active();
  if length(p_token_hash) <> 64 or p_token_hash !~ '^[0-9a-f]{64}$' or length(p_token_ciphertext) < 24 then raise exception 'INVALID_TOKEN'; end if;
  select qi.display_number into canonical_display from public.quote_issuances qi where qi.id = p_issuance_id and qi.user_id = uid;
  if canonical_display is null then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.entitlement_grants grant_row where grant_row.user_id = uid and grant_row.access_level = 'PRO' and grant_row.starts_at <= now() and (grant_row.ends_at is null or grant_row.ends_at >= now()) and grant_row.revoked_at is null) then raise exception 'PRO_REQUIRED'; end if;
  if jsonb_typeof(p_snapshot_payload) <> 'object' or p_snapshot_payload = '{}'::jsonb then raise exception 'INVALID_SNAPSHOT'; end if;
  perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));
  update public.quote_shares share_row set lifecycle = 'SUPERSEDED', superseded_at = coalesce(share_row.superseded_at, now()) where share_row.quote_issuance_id = p_issuance_id and share_row.owner_user_id = uid and share_row.lifecycle = 'ACTIVE';
  select snapshot_row.id, snapshot_row.version into snapshot_id, snapshot_version from public.quote_share_snapshots snapshot_row where snapshot_row.quote_issuance_id = p_issuance_id and snapshot_row.owner_user_id = uid order by snapshot_row.version desc limit 1;
  if snapshot_id is null then snapshot_version := 1; insert into public.quote_share_snapshots(quote_issuance_id, owner_user_id, version, payload) values(p_issuance_id, uid, snapshot_version, jsonb_set(p_snapshot_payload, '{numberLabel}', to_jsonb(canonical_display), true)) returning id into snapshot_id; end if;
  insert into public.quote_shares(quote_issuance_id, snapshot_id, owner_user_id, token_hash, lifecycle, commercial_outcome) values(p_issuance_id, snapshot_id, uid, p_token_hash, 'ACTIVE', 'PENDING') returning id into created_share_id;
  insert into public.quote_share_token_secrets(share_id, token_ciphertext) values(created_share_id, p_token_ciphertext);
  share_id := created_share_id; issuance_id := p_issuance_id; version := snapshot_version; lifecycle := 'ACTIVE'; commercial_outcome := 'PENDING'; return next;
end;
$$;

create or replace function public.revoke_quote_share(p_share_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_account_active();
  update public.quote_shares set lifecycle = 'REVOKED', revoked_at = coalesce(revoked_at, now()) where id = p_share_id and owner_user_id = auth.uid() and lifecycle in ('ACTIVE', 'REVOKED');
  return found;
end;
$$;

create or replace function public.supersede_parent_revision_shares(p_parent_issuance_id uuid, p_revision_issuance_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_user_id uuid := auth.uid(); v_updated integer := 0;
begin
  perform public.assert_account_active();
  if p_parent_issuance_id is null or p_revision_issuance_id is null then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '22023'; end if;
  if not exists (select 1 from public.quote_issuances revision_issuance join public.quote_issuances parent_issuance on parent_issuance.id = revision_issuance.parent_issuance_id where revision_issuance.id = p_revision_issuance_id and revision_issuance.user_id = v_user_id and revision_issuance.revision_number > 0 and parent_issuance.id = p_parent_issuance_id and parent_issuance.user_id = v_user_id) then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '23514'; end if;
  update public.quote_shares share_row set lifecycle = 'SUPERSEDED', superseded_at = coalesce(share_row.superseded_at, now()) where share_row.quote_issuance_id = p_parent_issuance_id and share_row.owner_user_id = v_user_id and share_row.lifecycle = 'ACTIVE';
  get diagnostics v_updated = row_count; return v_updated;
end;
$$;

revoke all on function public.assert_account_active(uuid), public.get_account_lifecycle(), public.set_account_lifecycle(text) from public;
grant execute on function public.assert_account_active(uuid), public.get_account_lifecycle(), public.set_account_lifecycle(text) to authenticated;
