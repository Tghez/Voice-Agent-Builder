import { getWriter } from "@langchain/langgraph";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { historyToMessages } from "../history";
import type { BuilderState } from "../state";

/**
 * responder — the single place every user-facing reply is produced and
 * streamed. Branches on state to phrase each case: a clarifier question
 * (text already decided by clarifierNode, just relayed here), a test-call
 * readiness message, an edit summary, or a free-form question/chitchat
 * answer. Streams token-by-token via the graph's custom stream channel
 * (consumed by the API route as SSE).
 */
export async function responderNode(state: BuilderState): Promise<Partial<BuilderState>> {
  // Captured synchronously so it works from inside the stream's "text" event
  // callback, which runs outside the AsyncLocalStorage context getWriter() relies on.
  const write = getWriter();

  // clarifier decided this turn needs a question — relay it, don't regenerate.
  if (state.route === "edit" && state.done) {
    const reply = state.reply ?? "Could you clarify what you'd like changed?";
    write?.(reply);
    return { reply, done: true };
  }

  if (state.route === "test_call") {
    const reply =
      "Ready to place a test call with this agent. Pick a lead and confirm — I'll dial your demo number (~$0.13/min, a real call).";
    write?.(reply);
    return { reply, done: true };
  }

  if (state.route === "edit") {
    if (!state.changed) {
      const reply = "No changes were needed — the spec already matches that.";
      write?.(reply);
      return { reply, done: true };
    }
    return editSummary(state, write);
  }

  // No agentId means nothing has been created/persisted this session yet —
  // workingSpec is just the blank starting template, not a real agent. Don't
  // hand it to the LLM as "current spec" context or it'll invent an example.
  const base =
    "You are the builder assistant for a voice sales agent. Answer the user's question concisely.";
  const system = state.agentId
    ? `${base} Use the conversation and the current configuration below. If they just greet you, greet back and offer to help build or edit the agent.\n\nCurrent configuration:\n${JSON.stringify(state.workingSpec, null, 2)}`
    : `${base} No agent has been created in this session yet — use only the conversation so far, and do NOT invent or reference any example agent, name, or persona. If asked what you can help with, explain generally: you can configure identity (name/persona/voice/opening line), goal, lead-qualification criteria, and guardrails; every agent also comes with four built-in call actions (qualify leads, check availability, book meetings, schedule callbacks). Then invite them to describe the agent they want.`;

  const stream = getAnthropic().messages.stream({
    model: env.responderModel(),
    max_tokens: 1024,
    system,
    messages: historyToMessages(state.history, state.userMessage),
  });
  stream.on("text", (delta) => write?.(delta));
  const final = await stream.finalMessage();

  const text = final.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  if (!text) write?.("How can I help with your agent?");
  return { reply: text || "How can I help with your agent?", done: true };
}

const EDIT_SUMMARY_SYSTEM = `You report ONE edit to a voice sales agent's configuration back to the user, in a consultative, advisory tone.

You are given the user's request and the exact fields that changed (path: before → after). Write ONE short sentence (two at most) that:
- says what changed in plain language, never field paths or JSON ("Made her friendlier", not "identity.persona updated");
- flags any noteworthy side-effect or implication the user should know but may not have asked about — e.g. a voice swapped to match a new name, a lowered pass score letting more leads qualify, a tightened criterion filtering more out — OR reassures that a related concern is untouched ("qualification unchanged").

Be concrete and brief. No preamble, no greeting, no bullet points, no markdown. Only describe changes present in the diff — never invent one.`;

/**
 * Phrase the just-applied edit as one consultative sentence that flags
 * side-effects, instead of relaying the deterministic diff one-liners. The diff
 * (path + before/after) is already in state from the compiler node, so this is
 * a single cheap LLM call over the change set — streamed like every other reply.
 * On any failure it falls back to the deterministic summary so a flaky LLM call
 * never swallows the confirmation.
 */
async function editSummary(
  state: BuilderState,
  write: ReturnType<typeof getWriter>,
): Promise<Partial<BuilderState>> {
  const affordance = " You can view the compiled prompt or place a test call.";

  // Deterministic side-effect: did this edit drop the LAST qualification
  // criterion? With zero criteria the Track-1 fit gate has nothing to screen
  // on — scoreFit returns passed_gates:true / score 100, so every lead comes
  // back qualified. Removing criteria is a legitimate request, so we never
  // block it (per the invariant: warn, don't prevent) — but the user must be
  // told plainly. Computed here (not left to the summary LLM) so the warning
  // can't be silently dropped on a flaky turn.
  const criteriaEmptied =
    (state.prevSpec?.qualification.criteria.length ?? 0) > 0 &&
    state.workingSpec.qualification.criteria.length === 0;
  const warning = criteriaEmptied
    ? " Heads up: the agent now has no qualification criteria, so it can no longer screen leads — every lead it talks to will come back qualified. Add at least one criterion to start filtering again."
    : "";

  const fallback = `Done — ${(state.diff?.summary ?? ["Updated."]).join(" ")}${warning}${affordance}`;

  const fmt = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  };
  const changeLines = (state.diff?.changes ?? [])
    .map((c) => `- ${c.path}: ${fmt(c.before)} → ${fmt(c.after)}`)
    .join("\n");
  const userMsg = `User asked: "${state.userMessage}"

Fields that changed:
${changeLines || "(a new agent was created)"}

Deterministic summary: ${(state.diff?.summary ?? []).join(" ")}`;

  let streamed = "";
  try {
    const stream = getAnthropic().messages.stream({
      model: env.responderModel(),
      max_tokens: 200,
      system: EDIT_SUMMARY_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    stream.on("text", (delta) => {
      streamed += delta;
      write?.(delta);
    });
    await stream.finalMessage();
  } catch {
    // Nothing (or a partial) streamed yet → emit the deterministic summary.
    if (!streamed.trim()) {
      write?.(fallback);
      return { reply: fallback, done: true };
    }
  }

  const sentence = streamed.trim();
  if (!sentence) {
    write?.(fallback);
    return { reply: fallback, done: true };
  }
  // The warning is appended deterministically (the summary LLM only phrases the
  // change itself); the affordance follows it.
  write?.(`${warning}${affordance}`);
  return { reply: `${sentence}${warning}${affordance}`, done: true };
}
