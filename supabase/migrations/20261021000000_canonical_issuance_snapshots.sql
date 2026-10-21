-- Immutable server-side counterpart of the local issued quote snapshot.
-- It is intentionally independent from public sharing snapshots.
create table public.quote_issuance_snapshots (
  quote_issuance_id uuid primary key references public.quote_issuances(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_schema_version integer not null check (snapshot_schema_version >= 1),
  snapshot_json jsonb not null,
  client_name text not null check (length(trim(client_name)) > 0),
  title text not null check (length(trim(title)) > 0),
  quoted_amount_cents bigint not null check (quoted_amount_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  created_at timestamptz not null default now()
);

create index quote_issuance_snapshots_owner_created_idx
  on public.quote_issuance_snapshots(owner_user_id, created_at desc);

alter table public.quote_issuance_snapshots enable row level security;
revoke all on public.quote_issuance_snapshots from anon, authenticated;
grant select on public.quote_issuance_snapshots to authenticated;
create policy "owners read own issuance snapshots"
  on public.quote_issuance_snapshots for select to authenticated
  using ((select auth.uid()) = owner_user_id);

create function public.prevent_quote_issuance_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ISSUANCE_SNAPSHOT_IMMUTABLE' using errcode = 'P0001';
end;
$$;

create trigger quote_issuance_snapshots_immutable
before update or delete on public.quote_issuance_snapshots
for each row execute function public.prevent_quote_issuance_snapshot_mutation();

create function public.register_quote_issuance_snapshot(
  p_issuance_id uuid,
  p_snapshot jsonb
)
returns table(
  quote_issuance_id uuid,
  snapshot_schema_version integer,
  client_name text,
  title text,
  quoted_amount_cents bigint,
  currency text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_issuance public.quote_issuances%rowtype;
  v_existing public.quote_issuance_snapshots%rowtype;
  v_schema_version integer;
  v_snapshot_quote_id text;
  v_number integer;
  v_year integer;
  v_revision_number integer;
  v_client_name text;
  v_title text;
  v_total_cents bigint;
begin
  perform public.assert_account_active();
  if p_issuance_id is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_ISSUANCE_SNAPSHOT' using errcode = '22023';
  end if;

  if jsonb_typeof(p_snapshot->'schemaVersion') <> 'number'
    or jsonb_typeof(p_snapshot->'id') <> 'string'
    or jsonb_typeof(p_snapshot->'number') <> 'number'
    or jsonb_typeof(p_snapshot->'numberYear') <> 'number'
    or jsonb_typeof(p_snapshot->'revisionNumber') <> 'number'
    or jsonb_typeof(p_snapshot->'client') <> 'string'
    or jsonb_typeof(p_snapshot->'title') <> 'string'
    or jsonb_typeof(p_snapshot->'economics') <> 'object'
    or jsonb_typeof(p_snapshot->'economics'->'totalCents') <> 'number'
    or p_snapshot->>'status' <> 'issued' then
    raise exception 'INVALID_ISSUANCE_SNAPSHOT' using errcode = '22023';
  end if;

  begin
    v_schema_version := (p_snapshot->>'schemaVersion')::integer;
    v_snapshot_quote_id := p_snapshot->>'id';
    v_number := (p_snapshot->>'number')::integer;
    v_year := (p_snapshot->>'numberYear')::integer;
    v_revision_number := (p_snapshot->>'revisionNumber')::integer;
    v_client_name := trim(p_snapshot->>'client');
    v_title := trim(p_snapshot->>'title');
    v_total_cents := (p_snapshot->'economics'->>'totalCents')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_ISSUANCE_SNAPSHOT' using errcode = '22023';
  end;

  if v_schema_version < 1 or v_number < 1 or v_year < 1 or v_revision_number < 0
    or length(v_snapshot_quote_id) not between 1 and 200
    or length(v_client_name) = 0 or length(v_title) = 0 or v_total_cents < 0 then
    raise exception 'INVALID_ISSUANCE_SNAPSHOT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));

  select issuance.* into v_issuance
  from public.quote_issuances issuance
  where issuance.id = p_issuance_id
    and issuance.user_id = v_user_id;
  if v_issuance.id is null then
    raise exception 'ISSUANCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_issuance.client_quote_id <> v_snapshot_quote_id
    or v_issuance.sequence_number <> v_number
    or v_issuance.sequence_year <> v_year
    or v_issuance.revision_number <> v_revision_number then
    raise exception 'ISSUANCE_SNAPSHOT_CONTEXT_MISMATCH' using errcode = '23514';
  end if;

  select existing.* into v_existing
  from public.quote_issuance_snapshots existing
  where existing.quote_issuance_id = p_issuance_id;
  if v_existing.quote_issuance_id is not null then
    if v_existing.owner_user_id <> v_user_id or v_existing.snapshot_json <> p_snapshot then
      raise exception 'ISSUANCE_SNAPSHOT_CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_existing.quote_issuance_id, v_existing.snapshot_schema_version,
      v_existing.client_name, v_existing.title, v_existing.quoted_amount_cents,
      v_existing.currency, v_existing.created_at;
    return;
  end if;

  insert into public.quote_issuance_snapshots (
    quote_issuance_id, owner_user_id, snapshot_schema_version, snapshot_json,
    client_name, title, quoted_amount_cents, currency
  ) values (
    p_issuance_id, v_user_id, v_schema_version, p_snapshot,
    v_client_name, v_title, v_total_cents, 'EUR'
  ) returning * into v_existing;

  return query select v_existing.quote_issuance_id, v_existing.snapshot_schema_version,
    v_existing.client_name, v_existing.title, v_existing.quoted_amount_cents,
    v_existing.currency, v_existing.created_at;
end;
$$;

revoke all on function public.register_quote_issuance_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.register_quote_issuance_snapshot(uuid, jsonb) to authenticated;
