import { StateGraph, START, END } from "@langchain/langgraph";
import { BuilderAnnotation, type BuilderState } from "./state";
import { routerNode } from "./nodes/router";
import { clarifierNode } from "./nodes/clarifier";
import { editorNode } from "./nodes/editor";
import { compilerNode } from "./nodes/compiler";
import { responderNode } from "./nodes/responder";
import { testRunnerNode } from "./nodes/testRunner";

/**
 * The builder graph (6 nodes):
 *
 *   START → router ─┬─ edit, needs clarification → clarifier ──────────────────→ responder → END
 *                   ├─ edit, clear ───────────────────────────────────→ editor ─┬─ changed → compiler ─┐
 *                   │                                                           └─ no-op ───────────────┼→ responder → END
 *                   ├─ test_call ────────────────────────────────────→ test_runner ──────────────────────┘
 *                   └─ question/chitchat ──────────────────────────────────────────────────────────────→ responder → END
 *
 * Router's own LLM call also decides needsClarification (single source of
 * truth — clarifier doesn't re-decide, it only formulates the question), so
 * the clarifier is entered only when a turn is actually underspecified, not
 * as a mandatory gate on every edit. The compiler runs ONCE after the editor
 * loop settles, and only when a tool call actually mutated the spec (skip it
 * on no-op turns so we don't create phantom spec writes / pointless Vapi
 * PATCHes). All user-facing replies funnel through responder, which phrases
 * each case. Inline clarifier ends the turn (no checkpointer).
 */

function fromRouter(s: BuilderState): "editor" | "clarifier" | "test_runner" | "responder" {
  switch (s.route) {
    case "edit":
      return s.needsClarification ? "clarifier" : "editor";
    case "test_call":
      return "test_runner";
    default:
      return "responder";
  }
}

const workflow = new StateGraph(BuilderAnnotation)
  .addNode("router", routerNode)
  .addNode("clarifier", clarifierNode)
  .addNode("editor", editorNode)
  .addNode("compiler", compilerNode)
  .addNode("responder", responderNode)
  .addNode("test_runner", testRunnerNode)
  .addEdge(START, "router")
  .addConditionalEdges("router", fromRouter, {
    editor: "editor",
    clarifier: "clarifier",
    test_runner: "test_runner",
    responder: "responder",
  })
  .addEdge("clarifier", "responder")
  .addConditionalEdges("editor", (s: BuilderState) => (s.changed ? "compiler" : "responder"), {
    compiler: "compiler",
    responder: "responder",
  })
  .addEdge("compiler", "responder")
  .addEdge("test_runner", "responder")
  .addEdge("responder", END);

export const builderGraph = workflow.compile();
