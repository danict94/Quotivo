-- QF-010A corrective migration: Edge Functions read the canonical outcome
-- through the service role while browser roles remain denied by RLS/grants.
grant select on public.quote_commercial_outcomes to service_role;
