-- Remove spec versioning: an agent now has exactly one live spec, updated in
-- place on every edit (no history/rollback). Run in the Supabase SQL editor.

alter table agents add column if not exists spec jsonb;

update agents a
set spec = (
  select s.spec from agent_specs s
  where s.agent_id = a.id and s.version = a.current_version
)
where a.spec is null;

alter table agents alter column spec set not null;
alter table agents drop column if exists current_version;

drop table if exists agent_specs;

alter table eval_runs drop column if exists spec_version;
