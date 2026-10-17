create table public.quote_number_sequences (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 year integer not null check(year between 2000 and 9999), series_key text not null default 'MAIN' check(series_key='MAIN'),
 last_number integer not null check(last_number>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(owner_user_id,year,series_key)
);
alter table public.quote_number_sequences enable row level security;
revoke all on public.quote_number_sequences from anon, authenticated;
grant select on public.quote_number_sequences to authenticated;
create policy "owners read quote sequences" on public.quote_number_sequences for select to authenticated using((select auth.uid())=owner_user_id);
alter table public.quote_issuances add column sequence_year integer, add column sequence_number integer, add column series_key text not null default 'MAIN', add column display_number text;
alter table public.quote_issuances add constraint quote_issuances_number_check check((sequence_year is null and sequence_number is null and display_number is null) or (sequence_year is not null and sequence_number is not null and display_number is not null));
create unique index quote_issuances_owner_number_unique on public.quote_issuances(user_id,sequence_year,series_key,sequence_number) where sequence_number is not null;

create or replace function public.initialize_quote_sequence(p_year integer,p_last_number integer default 0)
returns table(year integer,last_number integer,next_number integer) language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin if uid is null then raise exception 'AUTH_REQUIRED'; end if; if p_year<>extract(year from now())::integer or p_last_number<0 then raise exception 'INVALID_SEQUENCE'; end if;
 insert into public.quote_number_sequences(owner_user_id,year,series_key,last_number) values(uid,p_year,'MAIN',p_last_number) on conflict(owner_user_id,year,series_key) do nothing;
 return query select s.year,s.last_number,s.last_number+1 from public.quote_number_sequences s where s.owner_user_id=uid and s.year=p_year and s.series_key='MAIN'; end; $$;
create or replace function public.advance_quote_sequence(p_year integer,p_last_number integer)
returns table(year integer,last_number integer,next_number integer) language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin if uid is null then raise exception 'AUTH_REQUIRED'; end if; update public.quote_number_sequences set last_number=p_last_number,updated_at=now() where owner_user_id=uid and year=p_year and series_key='MAIN' and p_last_number>last_number; if not found then raise exception 'SEQUENCE_NOT_ADVANCED'; end if; return query select s.year,s.last_number,s.last_number+1 from public.quote_number_sequences s where s.owner_user_id=uid and s.year=p_year and s.series_key='MAIN'; end; $$;
create or replace function public.get_quote_sequence(p_year integer default extract(year from now())::integer) returns table(year integer,last_number integer,next_number integer)
language sql security definer set search_path='' as $$ select s.year,s.last_number,s.last_number+1 from public.quote_number_sequences s where s.owner_user_id=auth.uid() and s.year=p_year and s.series_key='MAIN' $$;

drop function public.authorize_quote_issue(text);
create function public.authorize_quote_issue(stable_quote_id text)
returns table(authorized boolean,reason text,issuance_id uuid,used_this_month integer,monthly_limit integer,sequence_number integer,year integer,display_number text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.quote_issuances%rowtype; pro boolean; usage_count integer; y integer:=extract(year from now())::integer; next_no integer; month_start timestamptz:=date_trunc('month',now());
begin if uid is null then raise exception 'AUTH_REQUIRED'; end if; if stable_quote_id is null or length(trim(stable_quote_id)) not between 1 and 200 then raise exception 'INVALID_QUOTE_ID'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text)); select * into existing from public.quote_issuances where user_id=uid and client_quote_id=trim(stable_quote_id); select count(*)::integer into usage_count from public.quote_issuances where user_id=uid and issued_at>=month_start;
 if found then return query select true,'AUTHORIZED',existing.id,usage_count,case when exists(select 1 from public.entitlement_grants g where g.user_id=uid and g.access_level='PRO' and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now()) and g.revoked_at is null) then null else 3 end,existing.sequence_number,existing.sequence_year,existing.display_number; return; end if;
 if not exists(select 1 from public.quote_number_sequences s where s.owner_user_id=uid and s.year=y and s.series_key='MAIN') then return query select false,'SEQUENCE_UNINITIALIZED',null::uuid,usage_count,null::integer,null::integer,y,null::text; return; end if;
 select exists(select 1 from public.entitlement_grants g where g.user_id=uid and g.access_level='PRO' and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now()) and g.revoked_at is null) into pro; if not pro and usage_count>=3 then return query select false,'QUOTA_EXCEEDED',null::uuid,usage_count,3,null::integer,y,null::text; end if;
 update public.quote_number_sequences set last_number=last_number+1,updated_at=now() where owner_user_id=uid and year=y and series_key='MAIN' returning last_number into next_no;
 insert into public.quote_issuances(user_id,client_quote_id,sequence_year,sequence_number,series_key,display_number) values(uid,trim(stable_quote_id),y,next_no,'MAIN',next_no::text||'/'||y::text) returning * into existing;
 return query select true,'AUTHORIZED',existing.id,usage_count+1,case when pro then null else 3 end,existing.sequence_number,existing.sequence_year,existing.display_number; end; $$;
revoke all on function public.initialize_quote_sequence(integer,integer),public.advance_quote_sequence(integer,integer),public.get_quote_sequence(integer),public.authorize_quote_issue(text) from public;
grant execute on function public.initialize_quote_sequence(integer,integer),public.advance_quote_sequence(integer,integer),public.get_quote_sequence(integer),public.authorize_quote_issue(text) to authenticated;
