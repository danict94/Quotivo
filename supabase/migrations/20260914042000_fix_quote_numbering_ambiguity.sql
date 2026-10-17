create or replace function public.initialize_quote_sequence(p_year integer,p_last_number integer default 0)
returns table(year integer,last_number integer,next_number integer)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_year<>extract(year from now())::integer or p_last_number<0 then raise exception 'INVALID_SEQUENCE'; end if;
 insert into public.quote_number_sequences(owner_user_id,year,series_key,last_number)
 values(uid,p_year,'MAIN',p_last_number)
 on conflict on constraint quote_number_sequences_pkey do nothing;
 return query
 select s.year,s.last_number,s.last_number+1
 from public.quote_number_sequences as s
 where s.owner_user_id=uid and s.year=p_year and s.series_key='MAIN';
end; $$;

create or replace function public.advance_quote_sequence(p_year integer,p_last_number integer)
returns table(year integer,last_number integer,next_number integer)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.quote_number_sequences as s
 set last_number=p_last_number,updated_at=now()
 where s.owner_user_id=uid and s.year=p_year and s.series_key='MAIN' and p_last_number>s.last_number;
 if not found then raise exception 'SEQUENCE_NOT_ADVANCED'; end if;
 return query
 select s.year,s.last_number,s.last_number+1
 from public.quote_number_sequences as s
 where s.owner_user_id=uid and s.year=p_year and s.series_key='MAIN';
end; $$;
