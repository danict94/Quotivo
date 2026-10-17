-- Server-only token vault. Ciphertext is intentionally kept out of the owner-readable share table.
create table public.quote_share_token_secrets (
  share_id uuid primary key references public.quote_shares(id) on delete cascade,
  token_ciphertext text not null,
  created_at timestamptz not null default now()
);
alter table public.quote_share_token_secrets enable row level security;
revoke all on public.quote_share_token_secrets from anon, authenticated;

create or replace function public.create_quote_share_secure(
  p_issuance_id uuid,
  p_snapshot_payload jsonb,
  p_token_hash text,
  p_token_ciphertext text
) returns table(share_id uuid, issuance_id uuid, version integer, status text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v integer; sid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(p_token_hash) <> 64 or p_token_hash !~ '^[0-9a-f]{64}$' or length(p_token_ciphertext)<24 then raise exception 'INVALID_TOKEN'; end if;
  if not exists(select 1 from public.quote_issuances where id=p_issuance_id and user_id=uid) then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from public.entitlement_grants g where g.user_id=uid and g.access_level='PRO' and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now()) and g.revoked_at is null) then raise exception 'PRO_REQUIRED'; end if;
  if jsonb_typeof(p_snapshot_payload)!='object' or p_snapshot_payload='{}'::jsonb then raise exception 'INVALID_SNAPSHOT'; end if;
  perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));
  update public.quote_shares set status='SUPERSEDED', superseded_at=now() where quote_issuance_id=p_issuance_id and owner_user_id=uid and status in ('PENDING','OPENED');
  select coalesce(max(version),0)+1 into v from public.quote_share_snapshots where quote_issuance_id=p_issuance_id;
  insert into public.quote_share_snapshots(quote_issuance_id,owner_user_id,version,payload) values(p_issuance_id,uid,v,p_snapshot_payload) returning id into sid;
  insert into public.quote_shares(quote_issuance_id,snapshot_id,owner_user_id,token_hash,status) values(p_issuance_id,sid,uid,p_token_hash,'PENDING') returning id into share_id;
  insert into public.quote_share_token_secrets(share_id,token_ciphertext) values(share_id,p_token_ciphertext);
  issuance_id:=p_issuance_id; version:=v; status:='PENDING'; return next;
end; $$;

create or replace function public.get_quote_share_status(p_share_id uuid)
returns table(share_id uuid, issuance_id uuid, status text, first_opened_at timestamptz, last_opened_at timestamptz, responded_at timestamptz, accepted_at timestamptz, rejected_at timestamptz, revoked_at timestamptz)
language sql security definer set search_path='' as $$
 select s.id,s.quote_issuance_id,s.status,s.first_opened_at,s.last_opened_at,s.responded_at,s.accepted_at,s.rejected_at,s.revoked_at
 from public.quote_shares s where s.id=p_share_id and s.owner_user_id=auth.uid();
$$;
revoke all on function public.create_quote_share_secure(uuid,jsonb,text,text), public.get_quote_share_status(uuid) from public;
grant execute on function public.create_quote_share_secure(uuid,jsonb,text,text), public.get_quote_share_status(uuid) to authenticated;
