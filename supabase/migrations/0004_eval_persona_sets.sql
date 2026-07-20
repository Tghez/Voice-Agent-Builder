-- Golden persona sets + full-persona case rows for the spec-grounded eval design.
-- Run in the Supabase SQL editor (like 0001–0003), in order.

-- Reset: the old runs were scored against generic hardcoded personas that don't
-- match any real agent's criteria, so their results are not comparable to the new
-- spec-grounded harness. Clear both eval tables (cascade drops eval_cases too).
truncate table eval_cases, eval_runs restart identity cascade;

-- One persisted, regenerate-on-spec-change persona set per agent. Mirrors the
-- "single overwritten-in-place field" shape used for agents.spec (0003) — no
-- history table. persona_set_spec_hash is the hash of the qualification-relevant
-- spec surface it was generated from; a mismatch at run time triggers regen.
alter table agents add column if not exists persona_set jsonb;
alter table agents add column if not exists persona_set_spec_hash text;

-- eval_cases.persona was a bare persona-id string; widen to jsonb to store the
-- FULL persona object used for that specific run, so historical case detail is
-- immune to the golden set later silently regenerating. (Tables were just
-- truncated, so there are no legacy string rows to recast.)
alter table eval_cases
  alter column persona type jsonb
  using case when persona is null then null else to_jsonb(persona) end;
