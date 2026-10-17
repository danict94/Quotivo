-- The return field `version` is a PL/pgSQL variable. Qualify the snapshot
-- column and keep the inserted share id in a distinct local variable so the
-- atomic snapshot/share/vault transaction cannot hit ambiguous identifiers.
create or replace function public.create_quote_share_secure(
  p_issuance_id uuid,
  p_snapshot_payload jsonb,
  p_token_hash text,
  p_token_ciphertext text
) returns table(share_id uuid, issuance_id uuid, version integer, status text)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid();
  next_version integer;
  snapshot_id uuid;
  created_share_id uuid;
  canonical_display text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(p_token_hash)<>64 or p_token_hash !~ '^[0-9a-f]{64}$' or length(p_token_ciphertext)<24 then raise exception 'INVALID_TOKEN'; end if;

  select qi.display_number into canonical_display
  from public.quote_issuances qi
  where qi.id=p_issuance_id and qi.user_id=uid;
  if canonical_display is null then raise exception 'NOT_FOUND'; end if;

  if not exists(
    select 1 from public.entitlement_grants grant_row
    where grant_row.user_id=uid and grant_row.access_level='PRO'
      and grant_row.starts_at<=now() and (grant_row.ends_at is null or grant_row.ends_at>=now())
      and grant_row.revoked_at is null
  ) then raise exception 'PRO_REQUIRED'; end if;
  if jsonb_typeof(p_snapshot_payload)!='object' or p_snapshot_payload='{}'::jsonb then raise exception 'INVALID_SNAPSHOT'; end if;

  perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));
  update public.quote_shares share_row
  set status='SUPERSEDED',superseded_at=now()
  where share_row.quote_issuance_id=p_issuance_id and share_row.owner_user_id=uid
    and share_row.status in('PENDING','OPENED');

  select coalesce(max(snapshot_row.version),0)+1 into next_version
  from public.quote_share_snapshots snapshot_row
  where snapshot_row.quote_issuance_id=p_issuance_id;

  insert into public.quote_share_snapshots(quote_issuance_id,owner_user_id,version,payload)
  values(p_issuance_id,uid,next_version,jsonb_set(p_snapshot_payload,'{numberLabel}',to_jsonb(canonical_display),true))
  returning id into snapshot_id;

  insert into public.quote_shares(quote_issuance_id,snapshot_id,owner_user_id,token_hash,status)
  values(p_issuance_id,snapshot_id,uid,p_token_hash,'PENDING')
  returning id into created_share_id;
  insert into public.quote_share_token_secrets(share_id,token_ciphertext)
  values(created_share_id,p_token_ciphertext);

  share_id:=created_share_id;
  issuance_id:=p_issuance_id;
  version:=next_version;
  status:='PENDING';
  return next;
end;
$$;
