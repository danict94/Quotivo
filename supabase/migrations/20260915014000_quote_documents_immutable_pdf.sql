insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-documents', 'quote-documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create table public.quote_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  issuance_id uuid not null unique references public.quote_issuances(id) on delete restrict,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/quote\\.pdf$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  mime_type text not null check (mime_type = 'application/pdf'),
  created_at timestamptz not null default now()
);
alter table public.quote_documents enable row level security;
revoke all on public.quote_documents from anon, authenticated;
grant select on public.quote_documents to authenticated;
create policy "owners read quote documents" on public.quote_documents for select to authenticated using ((select auth.uid()) = owner_user_id);
grant select, insert on public.quote_documents to service_role;
