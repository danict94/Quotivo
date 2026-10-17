alter table public.quote_documents drop constraint quote_documents_storage_path_check;
alter table public.quote_documents add constraint quote_documents_storage_path_check check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/quote[.]pdf$');
