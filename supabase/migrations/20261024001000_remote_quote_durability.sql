-- QF-042B: editable quote drafts are durable remote projections. Issuances and
-- their immutable snapshots remain in their existing canonical tables.

create table public.quote_draft_projections (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  quote_id text not null check (length(trim(quote_id)) between 1 and 200),
  client_id text,
  revision_root_quote_id text,
  parent_quote_id text,
  revision_number integer not null check (revision_number >= 0),
  draft_json jsonb not null check (jsonb_typeof(draft_json) = 'object'),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_user_id, quote_id),
  check ((revision_number = 0 and revision_root_quote_id is null and parent_quote_id is null)
    or (revision_number > 0 and revision_root_quote_id is not null and parent_quote_id is not null))
);

create table public.quote_draft_sync_operations (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  quote_id text not null,
  operation_id text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, quote_id, operation_id)
);

create index quote_draft_projections_owner_updated_idx
  on public.quote_draft_projections(owner_user_id, updated_at);

alter table public.quote_draft_projections enable row level security;
alter table public.quote_draft_sync_operations enable row level security;
revoke all on public.quote_draft_projections, public.quote_draft_sync_operations from public, anon, authenticated;
grant select on public.quote_draft_projections to authenticated;
create policy "quote draft projections owner read" on public.quote_draft_projections
  for select to authenticated using (owner_user_id = (select auth.uid()));

create function public.quote_draft_projection_record(p_owner_user_id uuid, p_quote_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.quote_draft_projections%rowtype;
begin
  select * into v_row from public.quote_draft_projections
  where owner_user_id = p_owner_user_id and quote_id = p_quote_id;
  if v_row.quote_id is null then return null; end if;
  return jsonb_build_object(
    'quote_id', v_row.quote_id, 'version', v_row.version,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at,
    'deleted_at', v_row.deleted_at, 'payload', v_row.draft_json
  );
end;
$$;

-- Read-only bootstrap for a new SQLite projection. Issued content comes from
-- the immutable issuance snapshot; editable content comes only from drafts.
create function public.get_quote_restore_snapshot()
returns table(kind text, quote_id text, version bigint, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz, payload jsonb)
language sql security definer set search_path = '' as $$
  select 'ISSUED'::text, issuance.client_quote_id, 1::bigint,
    snapshot.created_at, snapshot.created_at, null::timestamptz,
    jsonb_build_object('issuanceId', issuance.id, 'snapshot', snapshot.snapshot_json)
  from public.quote_issuances issuance
  inner join public.quote_issuance_snapshots snapshot on snapshot.quote_issuance_id = issuance.id
  where issuance.user_id = auth.uid()
  union all
  select 'DRAFT'::text, draft.quote_id, draft.version, draft.created_at,
    draft.updated_at, draft.deleted_at, draft.draft_json
  from public.quote_draft_projections draft
  where draft.owner_user_id = auth.uid();
$$;

create function public.sync_quote_draft_projection(
  p_quote_id text,
  p_operation_id text,
  p_expected_version bigint,
  p_payload jsonb
)
returns table(outcome text, record jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare
  v_owner uuid := auth.uid();
  v_existing jsonb;
  v_result jsonb;
  v_previous_payload jsonb;
  v_deleted boolean;
  v_revision_number integer;
  v_root text;
  v_parent text;
begin
  perform public.assert_account_active();
  if coalesce(length(trim(p_quote_id)), 0) = 0
    or coalesce(length(trim(p_operation_id)), 0) = 0
    or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload->'id') <> 'string'
    or p_payload->>'id' <> p_quote_id
    or p_payload->>'status' <> 'draft'
    or jsonb_typeof(p_payload->'items') <> 'array'
    or jsonb_typeof(p_payload->'revisionNumber') <> 'number' then
    raise exception 'QUOTE_DRAFT_INVALID' using errcode = '22023';
  end if;
  begin
    v_revision_number := (p_payload->>'revisionNumber')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'QUOTE_DRAFT_INVALID' using errcode = '22023';
  end;
  v_root := nullif(p_payload->>'revisionRootQuoteId', '');
  v_parent := nullif(p_payload->>'parentQuoteId', '');
  if v_revision_number < 0
    or (v_revision_number = 0 and (v_root is not null or v_parent is not null))
    or (v_revision_number > 0 and (v_root is null or v_parent is null or v_root = p_quote_id or v_parent = p_quote_id)) then
    raise exception 'QUOTE_DRAFT_INVALID_LINEAGE' using errcode = '23514';
  end if;

  select operation.result, operation.payload into v_result, v_previous_payload
  from public.quote_draft_sync_operations operation
  where operation.owner_user_id = v_owner and operation.quote_id = p_quote_id
    and operation.operation_id = p_operation_id;
  if v_result is not null then
    if v_previous_payload <> p_payload then raise exception 'QUOTE_DRAFT_OPERATION_CONFLICT' using errcode = 'P0001'; end if;
    return query select v_result->>'outcome', v_result->'record'; return;
  end if;

  v_existing := public.quote_draft_projection_record(v_owner, p_quote_id);
  if v_existing is not null and p_expected_version is null
    and v_existing->'payload' = (p_payload - 'deleted')
    and ((v_existing->>'deleted_at') is not null) = coalesce((p_payload->>'deleted')::boolean, false) then
    v_result := jsonb_build_object('outcome', 'APPLIED', 'record', v_existing);
    insert into public.quote_draft_sync_operations values (v_owner, p_quote_id, p_operation_id, p_payload, v_result);
    return query select 'APPLIED', v_existing; return;
  end if;
  if v_existing is not null and (p_expected_version is null or (v_existing->>'version')::bigint <> p_expected_version) then
    v_result := jsonb_build_object('outcome', 'CONFLICT', 'record', v_existing);
    insert into public.quote_draft_sync_operations values (v_owner, p_quote_id, p_operation_id, p_payload, v_result);
    return query select 'CONFLICT', v_existing; return;
  end if;

  v_deleted := coalesce((p_payload->>'deleted')::boolean, false);
  insert into public.quote_draft_projections(
    owner_user_id, quote_id, client_id, revision_root_quote_id, parent_quote_id,
    revision_number, draft_json, deleted_at
  ) values (
    v_owner, p_quote_id, nullif(p_payload->>'clientId',''), v_root, v_parent,
    v_revision_number, p_payload - 'deleted', case when v_deleted then now() else null end
  ) on conflict(owner_user_id, quote_id) do update set
    client_id = excluded.client_id, revision_root_quote_id = excluded.revision_root_quote_id,
    parent_quote_id = excluded.parent_quote_id, revision_number = excluded.revision_number,
    draft_json = excluded.draft_json, deleted_at = excluded.deleted_at,
    version = public.quote_draft_projections.version + 1, updated_at = now();

  v_existing := public.quote_draft_projection_record(v_owner, p_quote_id);
  v_result := jsonb_build_object('outcome', 'APPLIED', 'record', v_existing);
  insert into public.quote_draft_sync_operations values (v_owner, p_quote_id, p_operation_id, p_payload, v_result);
  return query select 'APPLIED', v_existing;
end;
$$;

revoke all on function public.quote_draft_projection_record(uuid, text) from public, anon, authenticated;
revoke all on function public.get_quote_restore_snapshot() from public, anon;
revoke all on function public.sync_quote_draft_projection(text, text, bigint, jsonb) from public, anon;
grant execute on function public.get_quote_restore_snapshot() to authenticated;
grant execute on function public.sync_quote_draft_projection(text, text, bigint, jsonb) to authenticated;
