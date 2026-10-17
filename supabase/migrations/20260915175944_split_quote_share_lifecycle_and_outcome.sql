-- A share's availability and its commercial response are independent facts.
-- Keep all historical timestamps; the legacy status is removed only after its
-- values have been projected into the two explicit dimensions.
alter table public.quote_shares
  add column lifecycle text,
  add column commercial_outcome text,
  add column opened_at timestamptz;

update public.quote_shares
set
  lifecycle = case status
    when 'REVOKED' then 'REVOKED'
    when 'SUPERSEDED' then 'SUPERSEDED'
    else 'ACTIVE'
  end,
  commercial_outcome = case
    when status = 'ACCEPTED' or accepted_at is not null then 'ACCEPTED'
    when status = 'REJECTED' or rejected_at is not null then 'REJECTED'
    else 'PENDING'
  end,
  opened_at = coalesce(first_opened_at, last_opened_at);

alter table public.quote_shares
  alter column lifecycle set not null,
  alter column commercial_outcome set not null,
  add constraint quote_shares_lifecycle_check check (lifecycle in ('ACTIVE', 'REVOKED', 'SUPERSEDED')),
  add constraint quote_shares_commercial_outcome_check check (commercial_outcome in ('PENDING', 'ACCEPTED', 'REJECTED'));

alter table public.quote_shares drop constraint if exists quote_shares_status_check;
alter table public.quote_shares drop column status;

create or replace function public.enforce_quote_share_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.commercial_outcome in ('ACCEPTED', 'REJECTED')
    and new.commercial_outcome is distinct from old.commercial_outcome then
    raise exception 'COMMERCIAL_OUTCOME_FINAL';
  end if;
  if old.commercial_outcome = 'PENDING'
    and new.commercial_outcome not in ('PENDING', 'ACCEPTED', 'REJECTED') then
    raise exception 'INVALID_COMMERCIAL_OUTCOME';
  end if;
  if old.lifecycle = 'REVOKED' and new.lifecycle <> 'REVOKED' then
    raise exception 'LIFECYCLE_FINAL';
  end if;
  if old.lifecycle = 'SUPERSEDED' and new.lifecycle <> 'SUPERSEDED' then
    raise exception 'LIFECYCLE_FINAL';
  end if;
  if old.lifecycle = 'ACTIVE' and new.lifecycle not in ('ACTIVE', 'REVOKED', 'SUPERSEDED') then
    raise exception 'INVALID_LIFECYCLE';
  end if;
  if old.opened_at is not null and new.opened_at is distinct from old.opened_at then
    raise exception 'OPENED_AT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger quote_shares_state_transition
before update on public.quote_shares
for each row execute function public.enforce_quote_share_state_transition();

drop function if exists public.create_quote_share(uuid, jsonb);
drop function if exists public.create_quote_share_secure(uuid, jsonb, text, text);
drop function if exists public.get_quote_share_status(uuid);

create function public.create_quote_share_secure(
  p_issuance_id uuid,
  p_snapshot_payload jsonb,
  p_token_hash text,
  p_token_ciphertext text
) returns table(
  share_id uuid,
  issuance_id uuid,
  version integer,
  lifecycle text,
  commercial_outcome text
)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  snapshot_id uuid;
  snapshot_version integer;
  created_share_id uuid;
  canonical_display text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(p_token_hash) <> 64 or p_token_hash !~ '^[0-9a-f]{64}$' or length(p_token_ciphertext) < 24 then
    raise exception 'INVALID_TOKEN';
  end if;

  select qi.display_number into canonical_display
  from public.quote_issuances qi
  where qi.id = p_issuance_id and qi.user_id = uid;
  if canonical_display is null then raise exception 'NOT_FOUND'; end if;
  if not exists (
    select 1 from public.entitlement_grants grant_row
    where grant_row.user_id = uid and grant_row.access_level = 'PRO'
      and grant_row.starts_at <= now()
      and (grant_row.ends_at is null or grant_row.ends_at >= now())
      and grant_row.revoked_at is null
  ) then raise exception 'PRO_REQUIRED'; end if;
  if jsonb_typeof(p_snapshot_payload) <> 'object' or p_snapshot_payload = '{}'::jsonb then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));

  -- A later share replaces link availability only; it never alters the
  -- immutable snapshot/document or an already recorded commercial outcome.
  update public.quote_shares share_row
  set lifecycle = 'SUPERSEDED', superseded_at = coalesce(share_row.superseded_at, now())
  where share_row.quote_issuance_id = p_issuance_id
    and share_row.owner_user_id = uid
    and share_row.lifecycle = 'ACTIVE';

  select snapshot_row.id, snapshot_row.version
    into snapshot_id, snapshot_version
  from public.quote_share_snapshots snapshot_row
  where snapshot_row.quote_issuance_id = p_issuance_id
    and snapshot_row.owner_user_id = uid
  order by snapshot_row.version desc
  limit 1;

  if snapshot_id is null then
    snapshot_version := 1;
    insert into public.quote_share_snapshots(quote_issuance_id, owner_user_id, version, payload)
    values (
      p_issuance_id,
      uid,
      snapshot_version,
      jsonb_set(p_snapshot_payload, '{numberLabel}', to_jsonb(canonical_display), true)
    ) returning id into snapshot_id;
  end if;

  insert into public.quote_shares(
    quote_issuance_id, snapshot_id, owner_user_id, token_hash,
    lifecycle, commercial_outcome
  ) values (
    p_issuance_id, snapshot_id, uid, p_token_hash,
    'ACTIVE', 'PENDING'
  ) returning id into created_share_id;
  insert into public.quote_share_token_secrets(share_id, token_ciphertext)
  values (created_share_id, p_token_ciphertext);

  share_id := created_share_id;
  issuance_id := p_issuance_id;
  version := snapshot_version;
  lifecycle := 'ACTIVE';
  commercial_outcome := 'PENDING';
  return next;
end;
$$;

create or replace function public.revoke_quote_share(p_share_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.quote_shares
  set lifecycle = 'REVOKED', revoked_at = coalesce(revoked_at, now())
  where id = p_share_id
    and owner_user_id = auth.uid()
    and lifecycle in ('ACTIVE', 'REVOKED');
  return found;
end;
$$;

create function public.get_quote_share_status(p_share_id uuid)
returns table(
  share_id uuid,
  issuance_id uuid,
  lifecycle text,
  commercial_outcome text,
  opened_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select s.id, s.quote_issuance_id, s.lifecycle, s.commercial_outcome,
    s.opened_at, s.first_opened_at, s.last_opened_at, s.responded_at,
    s.accepted_at, s.rejected_at, s.revoked_at, s.superseded_at
  from public.quote_shares s
  where s.id = p_share_id and s.owner_user_id = auth.uid();
$$;

revoke all on function public.create_quote_share_secure(uuid, jsonb, text, text),
  public.revoke_quote_share(uuid), public.get_quote_share_status(uuid) from public;
grant execute on function public.create_quote_share_secure(uuid, jsonb, text, text),
  public.revoke_quote_share(uuid), public.get_quote_share_status(uuid) to authenticated;
