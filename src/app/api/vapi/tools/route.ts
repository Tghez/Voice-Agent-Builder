import { NextResponse } from "next/server";
import { buildToolSession, type WebhookToolContext } from "@/lib/runtime/context";
import { dispatchTool } from "@/lib/runtime/handlers";

/**
 * Vapi custom-tool webhook. Vapi POSTs { message: { type: "tool-calls",
 * toolCallList: [{ id, name, arguments }], call } }. We execute each tool on our
 * server and respond { results: [{ toolCallId, result }] }.
 *
 * Correlation to our call row / agent comes from call.metadata (set in
 * initiateCall), with assistantId as a fallback.
 */

interface VapiToolCall {
  id: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = body?.message ?? {};
  const call = message.call ?? {};
  const meta = call.metadata ?? {};

  const ctx: WebhookToolContext = {
    callRowId: meta.callRowId,
    agentId: meta.agentId,
    assistantId: call.assistantId ?? message.assistant?.id,
  };

  const toolCalls: VapiToolCall[] = message.toolCallList ?? [];
  const session = await buildToolSession(ctx);

  const results = [];
  for (const tc of toolCalls) {
    const name = tc.name ?? tc.function?.name ?? "";
    const args = parseArgs(tc.arguments ?? tc.function?.arguments);
    let result: string;
    try {
      result = await dispatchTool(name, args, session);
    } catch (e) {
      result = `Error running ${name}: ${(e as Error).message}`;
    }
    results.push({ toolCallId: tc.id, result });
  }

  return NextResponse.json({ results });
}
