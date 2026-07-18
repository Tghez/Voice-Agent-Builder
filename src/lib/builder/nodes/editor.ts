import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { applyToSpec, type BuilderToolName } from "@/lib/spec/apply";
import { BUILDER_TOOLS } from "../tools";
import { historyToMessages } from "../history";
import type { BuilderState } from "../state";

/**
 * editor — the pure tool-calling loop. The model self-sequences edits via the
 * configure_* tools; each call mutates the in-memory working spec (applyToSpec,
 * no LLM). The loop runs until the model emits no more tool calls; the compiler
 * then runs ONCE (graph edge) — never per tool call.
 *
 * Critical: the system prompt requires get_current_spec BEFORE any partial edit,
 * so a change like "make her friendlier" diffs against real state instead of
 * blind-overwriting fields the user didn't mention.
 */

const SYSTEM = `You edit a voice sales agent's configuration using tools. The config has: identity (name, persona, voice, firstMessage), goal, qualification (criteria + scoring), actions (which runtime tools the agent gets: qualify_lead, check_availability, book_meeting, schedule_callback), and guardrails.

Rules:
- ALWAYS call get_current_spec FIRST before any partial edit, so you change only what the user asked and preserve everything else. Do not blind-overwrite a section.
- Make surgical edits with the configure_* / set_* tools. Provide only the fields that change (configure_identity merges).
- If the user wants qualification, use configure_qualification with concrete criteria; mark hard requirements gate:true.
- When the user wants the agent to book meetings, include the needed actions (qualify_lead, check_availability, book_meeting, and schedule_callback for non-qualified leads).
- Keep persona/firstMessage natural for a phone call.
- When you have applied all needed edits, STOP (emit no more tool calls). Do not write a summary — that is handled downstream.`;

const MAX_STEPS = 8;

export async function editorNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const spec = state.workingSpec; // mutated in place
  const client = getAnthropic();
  const toolLog: string[] = [];
  // Start from the full session history so the editor applies edits in context
  // (e.g. the criteria the user gave in answer to the clarifier's question).
  const messages: Anthropic.MessageParam[] = historyToMessages(
    state.history,
    state.userMessage,
  );

  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.messages.create({
      model: env.builderModel(),
      max_tokens: 2048,
      system: SYSTEM,
      tools: BUILDER_TOOLS,
      messages,
    });

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    messages.push({ role: "assistant", content: resp.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "get_current_spec") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(spec),
        });
        continue;
      }
      const r = applyToSpec(spec, { name: tu.name as BuilderToolName, args: tu.input });
      if (r.ok) {
        toolLog.push(`${tu.name} → ${r.section}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `ok — updated ${r.section}`,
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `error: ${r.error}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { workingSpec: spec, toolLog, changed: toolLog.length > 0 };
}
