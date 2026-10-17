-- The encrypted token vault is never readable by mobile roles.  The owner
-- Edge Function runs as service_role and needs this single server-side read
-- privilege to recover an already-active share without creating a new one.
grant select on table public.quote_share_token_secrets to service_role;
