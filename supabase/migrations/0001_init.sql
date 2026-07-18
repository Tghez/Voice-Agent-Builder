-- Voice Agent Builder — initial schema
-- Run in the Supabase SQL editor (or `supabase db push`). gen_random_uuid() is
-- built in on Supabase Postgres.

-- ── Leads: a realistic CRM. Every phone routes to DEMO_PHONE (enforced by the
--    seed script) so we never dial a real prospect. ──
create table if not exists leads (
  id          text primary key,
  name        text not null,
  company     text not null,
  title       text not null,
  email       text not null,
  phone       text not null,
  notes       text not null default '',        -- unstructured context
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

-- ── Agents: points at the live spec version. ──
create table if not exists agents (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  current_version   int  not null default 0,
  vapi_assistant_id text,
  created_at        timestamptz not null default now()
);

-- ── Agent specs: versioned. Every version stored (history + rollback + tie eval
--    results to a version). ──
create table if not exists agent_specs (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references agents(id) on delete cascade,
  version           int  not null,
  spec              jsonb not null,
  vapi_assistant_id text,
  created_at        timestamptz not null default now(),
  unique (agent_id, version)
);

-- ── Calls: test + live. structured_outcome holds BOTH scoring tracks. ──
create table if not exists calls (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid references agents(id) on delete set null,
  lead_id            text references leads(id) on delete set null,
  mode               text not null check (mode in ('test','live')),
  vapi_call_id       text,
  status             text,
  transcript         jsonb,
  recording_url      text,
  duration_sec       numeric,
  cost_usd           numeric,
  -- { fit:{passed_gates,score,qualified,reason},
  --   intent:{intent_score,stage,urgency,signals,objections} | null,
  --   extracted:{...}, meeting_booked, callback_scheduled }
  structured_outcome jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists calls_agent_idx on calls(agent_id);
create index if not exists calls_mode_idx  on calls(mode);

-- ── Eval harness (text-mode). ──
create table if not exists eval_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid references agents(id) on delete set null,
  spec_version int,
  summary      jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists eval_cases (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references eval_runs(id) on delete cascade,
  persona     text,
  transcript  jsonb,
  scores      jsonb,
  passed      boolean,
  judge_notes text,
  created_at  timestamptz not null default now()
);
