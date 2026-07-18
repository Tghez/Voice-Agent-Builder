-- Grant the API roles access to the public tables. Supabase normally applies
-- these by default, but depending on how the tables were created the grants can
-- be missing (symptom: "42501 permission denied for table" even with the
-- service_role key). Run once in the SQL editor.
--
-- Single-tenant exercise: RLS is left off; server writes use service_role, and
-- anon/authenticated get read/write for the app's own queries.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Future tables inherit the same grants.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
