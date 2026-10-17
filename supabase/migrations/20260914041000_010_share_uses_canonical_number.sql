create or replace function public.create_quote_share_secure(p_issuance_id uuid,p_snapshot_payload jsonb,p_token_hash text,p_token_ciphertext text)
returns table(share_id uuid, issuance_id uuid, version integer, status text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v integer; sid uuid; canonical_display text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if length(p_token_hash)<>64 or p_token_hash !~ '^[0-9a-f]{64}$' or length(p_token_ciphertext)<24 then raise exception 'INVALID_TOKEN'; end if;
 select display_number into canonical_display from public.quote_issuances where id=p_issuance_id and user_id=uid;
 if canonical_display is null then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.entitlement_grants g where g.user_id=uid and g.access_level='PRO' and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now()) and g.revoked_at is null) then raise exception 'PRO_REQUIRED'; end if;
 if jsonb_typeof(p_snapshot_payload)!='object' or p_snapshot_payload='{}'::jsonb then raise exception 'INVALID_SNAPSHOT'; end if;
 perform pg_advisory_xact_lock(hashtext(p_issuance_id::text));
 update public.quote_shares set status='SUPERSEDED',superseded_at=now() where quote_issuance_id=p_issuance_id and owner_user_id=uid and status in('PENDING','OPENED');
 select coalesce(max(version),0)+1 into v from public.quote_share_snapshots where quote_issuance_id=p_issuance_id;
 insert into public.quote_share_snapshots(quote_issuance_id,owner_user_id,version,payload) values(p_issuance_id,uid,v,jsonb_set(p_snapshot_payload,'{numberLabel}',to_jsonb(canonical_display),true)) returning id into sid;
 insert into public.quote_shares(quote_issuance_id,snapshot_id,owner_user_id,token_hash,status) values(p_issuance_id,sid,uid,p_token_hash,'PENDING') returning id into share_id;
 insert into public.quote_share_token_secrets(share_id,token_ciphertext) values(share_id,p_token_ciphertext);
 issuance_id:=p_issuance_id;version:=v;status:='PENDING';return next;
end; $$;
