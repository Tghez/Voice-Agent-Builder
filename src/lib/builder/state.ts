import { Annotation } from "@langchain/langgraph";
import type { AgentSpec } from "@/lib/spec/schema";
import type { SpecDiff } from "./diff";

export type Route = "edit" | "question" | "test_call" | "chitchat";

/** One prior chat turn in this assistant-creation session. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Builder graph state. One invocation per user turn (inline clarifier, no
 * checkpointer): each invocation runs over the FULL chat history of this
 * assistant-creation session (supplied by the caller), so every node — router,
 * clarifier, editor, responder — sees what was said before (e.g. the clarifier
 * remembers the question it asked and the user's answer).
 */
export const BuilderAnnotation = Annotation.Root({
  // Inputs
  userMessage: Annotation<string>(),
  /** Prior turns of THIS session (not including the current userMessage). */
  history: Annotation<ChatTurn[]>(),
  agentId: Annotation<string | undefined>(),
  workingSpec: Annotation<AgentSpec>(),
  prevSpec: Annotation<AgentSpec | null>(),

  // Routing
  route: Annotation<Route | undefined>(),

  // Editor output
  toolLog: Annotation<string[]>(),
  changed: Annotation<boolean>(),

  // Compiler output
  diff: Annotation<SpecDiff | undefined>(),
  compiledPrompt: Annotation<string | undefined>(),
  assistantId: Annotation<string | undefined>(),

  // test_call staging (confirmation happens in the UI)
  testCall: Annotation<{ note: string } | undefined>(),

  // Final
  reply: Annotation<string | undefined>(),
  done: Annotation<boolean | undefined>(),
});

export type BuilderState = typeof BuilderAnnotation.State;
