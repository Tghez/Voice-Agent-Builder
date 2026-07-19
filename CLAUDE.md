@AGENTS.md

# Voice Agent Builder — project guide

A platform where a user chats with an AI **builder** that creates and edits a
voice AI sales agent in natural language. The generated voice agent calls leads,
qualifies them, and books meetings. (Alta AI-Engineer take-home.)

**Live repo:** https://github.com/Tghez/Voice-Agent-Builder (branch `main`).

## The one idea: spec-as-contract

Two agents never talk directly. They're joined by one canonical
artifact — the **AgentSpec** (`src/lib/spec/schema.ts`).

```
User NL ─▶ BUILDER GRAPH (LangGraph.js, LLM + pure tools) ─▶ AgentSpec (canonical, stored in DB)
                                                                 │
                                                                 ▼  compile() + Zod validate (deterministic, NO LLM)
                                                           Vapi Assistant (live config)
                                                                 │  Vapi hits our webhooks at call time
                                                                 ▼
                                          RUNTIME TOOLS: qualify_lead · check_availability · book_meeting · schedule_callback
                                                                 │  end-of-call webhook (transcript, outcome, cost)
                                                                 ▼
                                          Eval / Observability ──▶ insights back to the builder chat
```

## Load-bearing invariants (do NOT violate)

1. **The compiler is the ONLY Vapi-aware module** (`src/lib/compiler/`). Everything
   else speaks AgentSpec. If a Vapi type/field name appears outside `lib/compiler/`,
   stop and refactor. Swapping to Retell must touch only that dir.
2. **Compile-once / lead-per-call.** `renderPrompt(spec)` is lead-agnostic and emits
   a `{{leadContext}}` placeholder. One Vapi assistant is compiled per agent (PATCHed
   in place on every edit — no version history) and reused across every lead. Lead
   context (structured fields + `notes`) is injected PER-CALL by `initiateCall` via
   Vapi's `assistantOverrides.variableValues` — never baked into the compiled
   assistant (that would force recompile+PATCH per lead).
3. **Editor makes "edit" first-class.** The editor's system prompt is given the
   current spec directly (from `state.workingSpec`, already in memory — no read
   round trip) so it diffs against real state instead of blind-overwriting. The
   compiler node runs ONCE after the editor tool-loop settles → exactly one Vapi
   PATCH per turn, never per tool call.
4. **Hybrid scoring — two separate tracks, never merged.**
   - Track 1 **Fit** (`src/lib/scoring/fit.ts`): deterministic, mid-call inside
     `qualify_lead`, NO LLM. Hard gates → weighted score vs `passScore`. Unit-tested.
   - Track 2 **Intent** (`src/lib/scoring/intent.ts`): post-call LLM over transcript +
     lead notes. **Advisory only — NEVER overrides a hard gate**; it only modulates
     HOT/COLD within the qualified band.
5. **End-of-call webhook persists FIRST, scores intent SECOND.** `applyEndOfCall` saves
   the calls row (transcript/recording/cost/duration) before the intent LLM call; intent
   runs in a try/catch and sets `intent: null` on failure. A flaky LLM call must never
   lose a call record.
6. **Builder graph has session memory.** Each turn runs over the FULL chat history of
   that assistant-creation session (client-supplied, threaded into `state.history` and
   every LLM node via `historyToMessages()`). No LangGraph checkpointer — "fresh
   invocation over full history." The clarifier remembers its own question; follow-ups
   resolve against context.

## Module map (`src/`)

```
lib/
  spec/schema.ts        AgentSpecSchema (Zod) + Criterion + emptySpec()  ← canonical vocabulary
  spec/apply.ts         applyToSpec(): dumb switch, per-field validation, NO LLM
  compiler/             ★ ONLY Vapi-aware code
    renderPrompt.ts     spec → runtime prompt w/ {{leadContext}} placeholder (context layering)
    vapiMap.ts          pure spec → Vapi Assistant object (byte-identical); voice→Cartesia map
    vapiClient.ts       thin Vapi REST seam (interface + RealVapiClient); assistant CRUD + createCall
    compile.ts          validate(airlock) → build → POST/PATCH sync
  builder/              LangGraph.js — speaks AgentSpec only
    state.ts            BuilderAnnotation (incl. history: ChatTurn[])
    graph.ts            START→router→{clarifier→editor→compiler→responder | test_runner | responder}
    tools.ts            configure_* / set_* write tools (Anthropic tool defs)
    history.ts          historyToMessages(history, current)
    diff.ts             stable (key-order-insensitive) spec diff
    nodes/*.ts          router, clarifier, editor(pure-tool loop), compiler, responder, testRunner
  scoring/fit.ts        Track-1 deterministic (unit-tested)
  scoring/intent.ts     Track-2 advisory (structured output)
  runtime/handlers.ts   voice-agent tools behind a ToolSession seam (also used by evals)
  runtime/context.ts    build a live ToolSession from webhook correlation
  runtime/toolDefs.ts   Anthropic tool defs from a spec (for the eval agent)
  providers/crm.ts      CRMProvider + MockCRM + SupabaseCRM + getCRM() + renderLeadContext()
  providers/calendar.ts CalendarProvider + MockCalendar + getCalendar()  (Cal.com = TODO)
  providers/seedLeads.ts shared 10-lead dataset (mock + SQL seed source of truth)
  call/initiateCall.ts  the ONE shared call service (chat test + dashboard live) + buildCallPayload (pure)
  db/client.ts          serviceClient() (tolerant of pasted /rest/v1 URL)
  db/types.ts           row types (AgentRow, CallRow, StructuredOutcome, IntentResult, ...)
  db/repositories/      agents, calls, evals (typed data access — no raw queries elsewhere)
  evals/personas.ts     10 personas w/ ground-truth attributes + roleplay briefs
  evals/runner.ts       LLM-as-lead ↔ agent (same prompt+tools, real tool exec) + LLM-as-judge
  llm/client.ts         shared Anthropic client (getAnthropic()), wrapped with LangSmith's
                        wrapAnthropic — traces every call, nested under the current
                        LangGraph node when invoked inside builderGraph.invoke()
  env.ts                single typed source for ALL env access
app/
  page.tsx              Builder chat (diff chips, view-compiled-prompt, live spec panel, sends history)
  dashboard/page.tsx    leads (CRM look) + confirm-gated Call + calls view + aggregates
  evals/page.tsx        run harness + per-case pass/fail
  api/builder/route.ts  one chat turn → graph.stream() as SSE (loads spec by agentId, accepts history)
  api/calls/route.ts    POST place call (requires confirm:true, 428 otherwise) + GET list
  api/vapi/tools/route.ts   runtime tool webhook (message.toolCallList → {results})
  api/vapi/events/route.ts  end-of-call webhook (persist first, then Track-2 intent)
  api/evals/route.ts    POST run harness / GET list runs
  api/leads|agents/route.ts GET lists for the UI
components/Nav.tsx       top nav
```

## Data model (Supabase; `supabase/migrations/`)

`leads` (10 seeded; every `phone` forced to `DEMO_PHONE`) · `agents` (id, name,
`spec` jsonb — the one live spec, overwritten in place on every edit — + vapi_assistant_id)
· `calls` (mode test|live, transcript, recording_url, duration_sec, cost_usd,
`structured_outcome` jsonb = `{fit, intent, extracted, meeting_booked, callback_scheduled}`)
· `eval_runs` / `eval_cases`.

- `0001_init.sql` = schema. `0002_grants.sql` = table grants (Supabase default grants
  can be missing → symptom "42501 permission denied"). `0003_remove_agent_versioning.sql`
  = dropped the old `agent_specs` version history + `agents.current_version` +
  `eval_runs.spec_version` in favor of a single `agents.spec` column. Run all in the
  SQL editor, in order.

## Models & env (`src/lib/env.ts` is the ONLY place to read env)

- `BUILDER_MODEL` — builder graph nodes (router/clarifier/editor/responder, SDK),
  eval judge + LLM-as-lead, Track-2 intent. Code default `claude-sonnet-5`.
  **Currently overridden to `claude-haiku-4-5-20251001` in .env.local to save tokens
  while testing** — Haiku 4.5 supports structured outputs so it works, but is weaker
  at editor reasoning + judging. Switch back to `claude-sonnet-5` for the real demo/evals.
- `INCALL_MODEL` — passed to **Vapi's** anthropic provider. MUST be the DATED snapshot
  `claude-haiku-4-5-20251001` (Vapi rejects the bare alias with 400). The compiler owns this.
- `incallModelSdk()` = bare `claude-haiku-4-5` — the eval harness's agent side (direct SDK).
- Other env: `ANTHROPIC_API_KEY`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`,
  `NEXT_PUBLIC_SUPABASE_URL` (base URL, no /rest/v1), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PHONE` (E.164; all leads route here), `NEXT_PUBLIC_BASE_URL`,
  `CALCOM_API_KEY`/`CALCOM_EVENT_TYPE_ID` (optional — mock calendar used when unset).
- `.env.local` is gitignored (only `.env.example` is committed). It was created from the
  template and filled in by the user.
- **LangSmith tracing** (optional, read directly by the `langsmith` package — not routed
  through `env.ts`): `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`.
  `getAnthropic()` (`llm/client.ts`) wraps its client with `wrapAnthropic`, so every LLM
  call across the builder graph, eval judge, and Track-2 intent traces automatically.
  Inside `builderGraph.invoke()`/`.stream()` (api/builder/route.ts, scripts) each node —
  router, clarifier, editor, compiler, responder, test_runner — is its own child run, so a
  single builder turn shows up in LangSmith as one nested trace with per-phase timing
  and token usage. No code path breaks with tracing unset: unset/false is a silent no-op.
- **Builder chat is SSE-streamed.** api/builder/route.ts calls `builderGraph.stream(input,
  { streamMode: ["custom", "values"] })` instead of `.invoke()`. Nodes that set `reply`
  (responder, clarifier, test_runner) push text chunks onto the "custom" channel via
  `getWriter()?.(chunk)` — call `getWriter()` ONCE synchronously at the top of the node
  (before any `await`/event-callback) and reuse the returned function; re-deriving it
  inside a later callback (e.g. an Anthropic `stream.on("text", ...)` handler) can miss
  the AsyncLocalStorage context. The API route interleaves `"token"` SSE events (custom
  chunks) with a final `"done"` event carrying the last `"values"` snapshot (route, diff,
  compiledPrompt, spec, agentId). `src/app/page.tsx` reads the fetch body as a
  stream and parses `event:`/`data:` blocks by hand (no `EventSource`, since that only
  supports GET).

## Commands

- `npm run dev` → http://localhost:3000 (Builder · Dashboard · Evals)
- `npm test` — vitest (compiler byte-identical, fit scoring, runtime tools, diff, providers, call)
- `npm run build` — production build (must stay green)
- `npm run seed` — upsert 10 leads (phone → DEMO_PHONE)
- `npm run assistant:create` — hand-written spec → real Vapi assistant (Day-1 milestone)
- `npm run builder:smoke` — create + surgically edit an agent end-to-end
- `npm run memory:smoke` — clarifier asks → user answers → proceeds without re-asking
- `npm run eval:smoke` — 2-persona harness sanity check
- Scripts run via `node --env-file=.env.local --import tsx scripts/X.ts`.

## Provisioning state (as of this writing)

- Supabase: provisioned, all migrations run, 10 leads seeded. ✅
- Vapi: number bought in Vapi (not a separate Twilio account), `VAPI_PHONE_NUMBER_ID` set. ✅
- Anthropic key set; spend caps set in BOTH Vapi and Anthropic consoles. ✅
- `DEMO_PHONE` set (a real number; every lead routes there — never dials a prospect). ✅
- Cal.com: NOT configured → `getCalendar()` returns `MockCalendar`. Real `CalcomCalendar` = TODO.

## Gotchas / lessons (save future debugging)

- **Vapi anthropic model id must be dated** (`claude-haiku-4-5-20251001`); bare alias → 400.
  The Anthropic SDK accepts both bare and dated.
- **`zodOutputFormat` needs Zod v4** — files using structured output import `z` from
  `"zod/v4"` (intent.ts, evals/runner.ts, builder/nodes/router.ts, clarifier.ts). Everything
  else uses plain `"zod"` (v3).
- **Supabase URL** must be the base project URL; `serviceClient()` strips a pasted
  `/rest/v1`. Missing table grants → run `0002_grants.sql`.
- **tsx scripts**: no top-level await (wrap in `async main()`); tsx DOES resolve the `@/`
  tsconfig path alias.
- **`@langchain/langgraph`'s bare `writer()` export is broken in v1.4.8** — it reads
  `config.configurable.writer`, but `Pregel.stream()` only ever sets `config.writer`
  (top-level), so calling `writer(chunk)` silently no-ops (no error, no emitted event).
  `getWriter()` checks both locations and works — use that instead. See the SSE-streaming
  note above.
- **Vapi webhook shapes** (verified against docs): tool-calls = `message.toolCallList[].{id,name,arguments}`,
  respond `{results:[{toolCallId,result}]}`. Correlation via `message.call.metadata`
  (`callRowId`/`agentId`/`leadId`, set in initiateCall). End-of-call = `message.type ===
  "end-of-call-report"`, `message.artifact.transcript`/`recording`.
- **Diff must be key-order-insensitive** — jsonb from Supabase returns keys in arbitrary
  order; `diff.ts` uses a stable sorted-key stringify (else false-positive "changes").
- Git: small legible commits (history is graded); LF enforced via `.gitattributes`;
  co-author trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Known gaps / TODO

- **Public URL for webhooks.** `NEXT_PUBLIC_BASE_URL=localhost`, so during a real call
  Vapi can't reach `/api/vapi/tools` or `/api/vapi/events` — tools/qualify/book/transcript
  won't run. Fix: `ngrok http 3000` (or deploy to Vercel), set `NEXT_PUBLIC_BASE_URL`, and
  **recompile the assistant** (any builder edit re-runs the compiler and updates `server.url`;
  existing assistants still point at localhost until re-compiled).
- **README + Loom** — not written yet (graded deliverables). Deferred at user request.
- **Cal.com real provider** — `CalcomCalendar` not implemented; mock used.
- **Conversation persistence across reloads** — memory is in-session (client supplies the
  transcript). The spec persists via `agentId`; the raw chat does not. A `conversations`
  table would fix it if wanted.
- **Cartesia voice IDs** — real IDs mapped in `vapiMap.ts` but not per-voice audited.
- **Test agents accumulate** in Vapi/DB from smoke runs (no cleanup routine).
- **Builder on Haiku** currently (user override) — restore `claude-sonnet-5` for the demo.

## Conventions

- Path alias `@/*` → `src/*`. All env access via `src/lib/env.ts`. All DB access via
  `src/lib/db/repositories/*`. Never leak Vapi types outside `src/lib/compiler/`.
- Deterministic surfaces (compiler, fit scoring) are unit-tested and must stay so.
- Prefer the simplest change that preserves the boundaries above.
