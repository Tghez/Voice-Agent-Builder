@AGENTS.md

# Voice Agent Builder — project guide

A platform where a user chats with an AI **builder** that creates and edits a
voice AI sales agent in natural language. The generated voice agent calls leads,
qualifies them, and books meetings. (Alta AI-Engineer take-home.)

**Live repo:** https://github.com/Tghez/Voice-Agent-Builder (branch `main`).
`README.md` is the reviewer-facing doc (setup + architecture narrative); this file is the
working guide — invariants, module map, gotchas.

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
7. **Two eval tracks, different subjects — keep them apart.**
   - `lib/evals/` grades the **voice agent** (LLM-as-lead vs the compiled agent; fit
     ground truth deterministic, judge only checks guardrails).
   - `lib/builder-eval/` grades the **builder** (did the router label the turn right,
     did the editor change exactly the intended spec fields). Objective gold labels +
     `diffSpecs` — NO judge. It runs on a compiler-less mirror of the real graph and
     must stay side-effect-free: never PATCH Vapi, never write the DB.

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
    progress.ts         BuilderStatus chunks (kind:"status") onto the custom stream channel
                        → SSE "status" events; drives the chat's live checklist
    nodes/*.ts          router, clarifier, editor(pure-tool loop), compiler, responder, testRunner
  scoring/fit.ts        Track-1 deterministic (unit-tested)
  scoring/intent.ts     Track-2 advisory (structured output)
  runtime/handlers.ts   voice-agent tools behind a ToolSession seam (also used by evals)
  runtime/context.ts    build a live ToolSession from webhook correlation
  runtime/toolDefs.ts   Anthropic tool defs from a spec (for the eval agent)
  providers/crm.ts      CRMProvider + MockCRM + SupabaseCRM + getCRM() + renderLeadContext()
  providers/calendar.ts CalendarProvider + MockCalendar + CalcomCalendar + getCalendar()
  providers/seedLeads.ts shared 10-lead dataset (mock + SQL seed source of truth)
  call/initiateCall.ts  the ONE shared call service (chat test + dashboard live) + buildCallPayload (pure)
  db/client.ts          serviceClient() (tolerant of pasted /rest/v1 URL)
  db/types.ts           row types (AgentRow, CallRow, StructuredOutcome, IntentResult, ...)
  db/repositories/      agents, calls, evals (typed data access — no raw queries elsewhere)
  evals/types.ts        shared eval vocabulary (Persona, CaseSlot, scores, summaries) — types-only
  evals/casePlan.ts     buildCasePlan(spec)→ EXACTLY 10 deterministic slots + sampleValues() (unit-tested, NO LLM)
  evals/personaGen.ts   fleshOutPersonas() = ONE structured LLM call for prose; specHashForPersonaSet()
  evals/personaSet.ts   getOrCreatePersonaSet() golden set — persisted, regen only on spec-hash change
  evals/failureReasons.ts derive human failure reasons from case scores (shared: summary list + drawer)
  evals/runner.ts       LLM-as-lead ↔ agent (same prompt+tools, real tool exec); qualification ground
                        truth = scoreFit on persona attributes (NO LLM); judge only checks guardrails
  builder-eval/         ★ the OTHER eval track — grades the BUILDER, not the voice agent
    cases.ts            hand-authored tier-1 cases + spec fixtures; objective gold labels, NO judge
    graph.ts            compiler-less mirror of builderGraph (router → maybe editor → END):
                        reuses the REAL nodes, so runs are side-effect-free (no Vapi PATCH, no DB)
    runner.ts           runs each case; asserts router labels + deterministic diffSpecs
                        (intended fields changed, rest untouched). Traces to the
                        `builder-eval` LangSmith project; flushes the client before exit
  transcript.ts         shared calls.transcript parser (array-of-turns | string) — intent + dashboard
  evalRunStore.ts       client-side module-scope run store so an eval run survives navigation
                        away from /evals (useEvalRun(); not a full page reload)
  llm/client.ts         shared Anthropic client (getAnthropic()), wrapped with LangSmith's
                        wrapAnthropic — traces every call, nested under the current
                        LangGraph node when invoked inside builderGraph.invoke()
  env.ts                single typed source for ALL env access
app/
  page.tsx              Builder chat shell — SSE parsing + state only; UI lives in components/builder/
  dashboard/page.tsx    leads (CRM look) + confirm-gated Call (phone or browser) + calls + aggregates
  evals/page.tsx        run harness + per-case pass/fail
  dashboard/components/ AgentRail · LeadsPanel · CallsTable · CallDetailDrawer · KpiRow ·
                        ConfirmCallDialog · ui.tsx (shared primitives)
  evals/components/     EvalCaseDrawer (per-case slide-over: persona · fit · guardrails · transcript) ·
                        RunningBanner (live phase + elapsed, backed by evalRunStore)
  api/builder/route.ts  one chat turn → graph.stream() as SSE (loads spec by agentId, accepts history)
  api/calls/route.ts    POST place call (requires confirm:true, 428 otherwise) + GET list
  api/calls/web/route.ts POST register a BROWSER-placed call (Vapi Web SDK started it client-side;
                        this only writes the row so it lands on the dashboard with the right lead)
  api/vapi/tools/route.ts   runtime tool webhook (message.toolCallList → {results})
  api/vapi/events/route.ts  end-of-call webhook (persist first, then Track-2 intent)
  api/evals/route.ts    POST run harness / GET list runs (or GET ?caseId= for one full case → drawer)
  api/evals/prepare/route.ts POST ensure the golden persona set exists/is-current (the only LLM-gen step)
  api/leads|agents/route.ts GET lists for the UI
  api/agents/[id]/route.ts  GET one agent + spec + compiled prompt (Builder loads an existing agent)
components/Nav.tsx      top nav (also surfaces a running eval via useEvalRun())
components/builder/     Builder chat UI, decomposed: LeftRail (Agents · Identity · Prompt tabs) ·
                        AgentsPanel · SpecCard · PromptPanel · MessagesView · Message · Composer ·
                        Hero · ProgressSteps · ThinkingIndicator · FormattedText · Section ·
                        constants · types
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
  `eval_runs.spec_version` in favor of a single `agents.spec` column.
  `0004_eval_persona_sets.sql` = adds `agents.persona_set` (jsonb golden set) +
  `agents.persona_set_spec_hash`, widens `eval_cases.persona` to jsonb (full persona
  object per run), and truncates the eval tables (old generic-persona runs aren't
  comparable to the new spec-grounded harness). Run all in the SQL editor, in order.

## Models & env (`src/lib/env.ts` is the ONLY place to read env)

- `BUILDER_MODEL` — the reasoning nodes (router/clarifier/editor, SDK), eval judge +
  LLM-as-lead, Track-2 intent. Code default and current `.env.local` value: `claude-sonnet-5`.
- `RESPONDER_MODEL` — the responder node only (user-facing replies + edit summaries).
  Split out deliberately: phrasing is cheap, so it runs on Haiku
  (`claude-haiku-4-5-20251001` in `.env.local`) while the reasoning nodes stay on Sonnet.
  Falls back to `BUILDER_MODEL` when unset.
- `INCALL_MODEL` — passed to **Vapi's** anthropic provider. MUST be the DATED snapshot
  `claude-haiku-4-5-20251001` (Vapi rejects the bare alias with 400). The compiler owns this.
- `incallModelSdk()` (`INCALL_MODEL_SDK`) = bare `claude-haiku-4-5` — the eval harness's
  agent side (direct SDK), so text-mode evals mirror the voice agent.
- Other env: `ANTHROPIC_API_KEY`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`,
  `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (client-side key for the Web SDK — browser calls),
  `NEXT_PUBLIC_SUPABASE_URL` (base URL, no /rest/v1), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PHONE` (E.164; all leads route here), `NEXT_PUBLIC_BASE_URL`,
  `DEMO_EMAIL` (real inbox every Cal.com booking's attendee routes to — seed leads use
  `.example` addresses, which Cal.com rejects as undeliverable with a 400),
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
  the AsyncLocalStorage context. The custom channel carries TWO shapes and the route
  splits them by type: plain strings → `"token"` SSE events (reply text), `BuilderStatus`
  objects (`kind:"status"`, from `builder/progress.ts`) → `"status"` events (the live
  checklist) — so progress text never leaks into the assistant's reply. A final `"done"`
  event carries the last `"values"` snapshot (route, diff, compiledPrompt, spec, agentId);
  a thrown node sends `"error"`. `src/app/page.tsx` reads the fetch body as a stream and
  parses `event:`/`data:` blocks by hand (no `EventSource`, since that only supports GET).

## Commands

- `npm run dev` → http://localhost:3000 (Builder · Dashboard · Evals). Also starts the
  ngrok tunnel Vapi's webhooks call back into (`concurrently` runs `dev:next` +
  `dev:tunnel`; Ctrl+C stops both). `scripts/tunnel.mjs` pins the reserved domain parsed
  out of `NEXT_PUBLIC_BASE_URL`, so the public URL is stable and the Vapi webhook config
  never goes stale. Run `npm run dev:next` for the app alone.
- `npm test` — vitest, 10 files / 61 tests (compiler byte-identical, fit scoring, runtime
  tools, spec apply, diff, case plan, persona gen, eval runner, providers, call)
- `npm run build` — production build (must stay green)
- `npm run seed` — upsert 10 leads (phone → DEMO_PHONE)
- `npm run assistant:create` — hand-written spec → real Vapi assistant (Day-1 milestone)
- `npm run builder:smoke` — create + surgically edit an agent end-to-end
- `npm run memory:smoke` — clarifier asks → user answers → proceeds without re-asking
- `npm run eval:smoke` — 2-persona voice-agent harness sanity check
- `npm run eval:builder` — tier-1 BUILDER eval (router labels + surgical-edit diffs);
  side-effect-free (no Vapi PATCH, no DB write), traces to the `builder-eval` LangSmith project
- Scripts run via `node --env-file=.env.local --import tsx scripts/X.ts`.

## Provisioning state (as of this writing)

- Supabase: provisioned, all migrations run, 10 leads seeded. ✅
- Vapi: number bought in Vapi (not a separate Twilio account), `VAPI_PHONE_NUMBER_ID` set. ✅
- Anthropic key set; spend caps set in BOTH Vapi and Anthropic consoles. ✅
- `DEMO_PHONE` set (a real number; every lead routes there — never dials a prospect). ✅
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY` set — the dashboard can place a call in the browser
  (Vapi Web SDK) as well as over the phone. ✅
- Cal.com: `CalcomCalendar` implemented (`src/lib/providers/calendar.ts`, Cal.com API v2).
  `getCalendar()` returns it once `CALCOM_API_KEY` + `CALCOM_EVENT_TYPE_ID` are set, else
  `MockCalendar`. Both are set, so bookings are real. ✅ `DEMO_EMAIL` set (Cal.com rejects
  the seeded `.example` addresses as undeliverable). Google Calendar sync is a Cal.com-side
  setting (connect the Google Calendar app as the event type's destination calendar) —
  not app code.

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

## Conventions

- Path alias `@/*` → `src/*`. All env access via `src/lib/env.ts`. All DB access via
  `src/lib/db/repositories/*`. Never leak Vapi types outside `src/lib/compiler/`.
- Deterministic surfaces (compiler, fit scoring) are unit-tested and must stay so.
- Prefer the simplest change that preserves the boundaries above.
