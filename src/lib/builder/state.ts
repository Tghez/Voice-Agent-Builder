import { Annotation } from "@langchain/langgraph";
import type { AgentSpec } from "@/lib/spec/schema";
import type { SpecDiff } from "./diff";

export type Route = "edit" | "question" | "test_call" | "chitchat";

/**
 * Builder graph state. One invocation per user turn (inline clarifier, no
 * checkpointer): the next user message is a fresh invocation over full history.
 */
export const BuilderAnnotation = Annotation.Root({
  // Inputs
  userMessage: Annotation<string>(),
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
  version: Annotation<number | undefined>(),

  // test_call staging (confirmation happens in the UI)
  testCall: Annotation<{ note: string } | undefined>(),

  // Final
  reply: Annotation<string | undefined>(),
  done: Annotation<boolean | undefined>(),
});

export type BuilderState = typeof BuilderAnnotation.State;
