-- Keep the RPC argument names stable for PostgREST clients.  Qualify every
-- argument reference and every table column so new issuance columns cannot
-- silently collide with PL/pgSQL names.
create or replace function public.authorize_quote_issue(stable_quote_id text)
returns table(authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer, sequence_number integer, year integer, display_number text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_existing public.quote_issuances%rowtype;
  v_count integer := 0;
  v_is_pro boolean := false;
  v_year integer := extract(year from now())::integer;
  v_number integer;
  v_display text;
  v_month timestamptz := date_trunc('month', now());
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if authorize_quote_issue.stable_quote_id is null or length(trim(authorize_quote_issue.stable_quote_id)) not between 1 and 200 then raise exception 'INVALID_QUOTE_ID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select q.* into v_existing from public.quote_issuances q where q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_issue.stable_quote_id) limit 1;
  select count(*)::integer into v_count from public.quote_issuances q where q.user_id = v_user_id and q.issued_at >= v_month and q.revision_number = 0;
  select exists(select 1 from public.entitlement_grants g where g.user_id = v_user_id and g.access_level = 'PRO' and g.starts_at <= now() and (g.ends_at is null or g.ends_at >= now()) and g.revoked_at is null) into v_is_pro;
  if v_existing.id is not null then
    if v_existing.sequence_number is null or v_existing.sequence_year is null or v_existing.display_number is null then raise exception 'ISSUANCE_CANONICAL_NUMBER_MISSING' using errcode = '23514'; end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_count, case when v_is_pro then null else 3 end, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
    return;
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
declare
  v_user_id uuid := auth.uid();
  v_existing public.quote_issuances%rowtype;
  v_root public.quote_issuances%rowtype;
  v_parent public.quote_issuances%rowtype;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if authorize_quote_revision_issue.stable_quote_id is null or length(trim(authorize_quote_revision_issue.stable_quote_id)) not between 1 and 200
    or authorize_quote_revision_issue.root_issuance_id is null or authorize_quote_revision_issue.parent_issuance_id is null
    or authorize_quote_revision_issue.root_client_quote_id is null or authorize_quote_revision_issue.parent_client_quote_id is null
    or authorize_quote_revision_issue.requested_revision_number is null or authorize_quote_revision_issue.requested_revision_number < 1 then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select count(*)::integer into v_count from public.quote_issuances q where q.user_id = v_user_id and q.issued_at >= date_trunc('month', now()) and q.revision_number = 0;
  select q.* into v_existing from public.quote_issuances q where q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.stable_quote_id) limit 1;
  if v_existing.id is not null then
    if v_existing.revision_root_issuance_id <> authorize_quote_revision_issue.root_issuance_id or v_existing.parent_issuance_id <> authorize_quote_revision_issue.parent_issuance_id or v_existing.revision_number <> authorize_quote_revision_issue.requested_revision_number then raise exception 'ISSUANCE_CONTEXT_MISMATCH' using errcode = '23514'; end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_count, 3, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
    return;
  end if;
  select q.* into v_root from public.quote_issuances q where q.id = authorize_quote_revision_issue.root_issuance_id and q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.root_client_quote_id) and q.revision_number = 0;
  if v_root.id is null or v_root.sequence_number is null or v_root.sequence_year is null or v_root.display_number is null then raise exception 'INVALID_REVISION_ROOT' using errcode = '23514'; end if;
  select q.* into v_parent from public.quote_issuances q where q.id = authorize_quote_revision_issue.parent_issuance_id and q.user_id = v_user_id and q.client_quote_id = trim(authorize_quote_revision_issue.parent_client_quote_id);
  if v_parent.id is null or v_parent.revision_number <> authorize_quote_revision_issue.requested_revision_number - 1 or (v_parent.id <> v_root.id and v_parent.revision_root_issuance_id <> v_root.id) then raise exception 'INVALID_REVISION_PARENT' using errcode = '23514'; end if;
  if exists(select 1 from public.quote_issuances q where q.user_id = v_user_id and q.parent_issuance_id = v_parent.id) then return query select false, 'REVISION_PARENT_NOT_LATEST', null::uuid, v_count, 3, v_root.sequence_number, v_root.sequence_year, v_root.display_number; return; end if;
  if exists(select 1 from public.quote_issuances q where q.user_id = v_user_id and q.revision_root_issuance_id = v_root.id and q.revision_number = authorize_quote_revision_issue.requested_revision_number) then return query select false, 'REVISION_ALREADY_EXISTS', null::uuid, v_count, 3, v_root.sequence_number, v_root.sequence_year, v_root.display_number; return; end if;
  insert into public.quote_issuances(user_id, client_quote_id, sequence_year, sequence_number, series_key, display_number, revision_root_issuance_id, parent_issuance_id, revision_number)
  values(v_user_id, trim(authorize_quote_revision_issue.stable_quote_id), v_root.sequence_year, v_root.sequence_number, v_root.series_key, v_root.display_number, v_root.id, v_parent.id, authorize_quote_revision_issue.requested_revision_number) returning * into v_existing;
  return query select true, 'AUTHORIZED', v_existing.id, v_count, 3, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
end;
$$;

revoke all on function public.authorize_quote_issue(text), public.authorize_quote_revision_issue(text, uuid, uuid, text, text, integer) from public;
grant execute on function public.authorize_quote_issue(text), public.authorize_quote_revision_issue(text, uuid, uuid, text, text, integer) to authenticated;
