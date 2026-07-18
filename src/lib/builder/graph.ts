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
 *   START → router ─┬─ edit ──────→ clarifier ─┬─ (asks Q) → END
 *                   │                           └─ (proceed) → editor → compiler → responder → END
 *                   ├─ test_call ─→ test_runner → END
 *                   └─ question/chitchat → responder → END
 *
 * Router and editor are separate nodes. The compiler runs ONCE after the editor
 * loop settles. Inline clarifier ends the turn (no checkpointer).
 */

function fromRouter(s: BuilderState): "clarifier" | "test_runner" | "responder" {
  switch (s.route) {
    case "edit":
      return "clarifier";
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
    clarifier: "clarifier",
    test_runner: "test_runner",
    responder: "responder",
  })
  .addConditionalEdges("clarifier", (s: BuilderState) => (s.done ? "end" : "editor"), {
    editor: "editor",
    end: END,
  })
  .addEdge("editor", "compiler")
  .addEdge("compiler", "responder")
  .addEdge("responder", END)
  .addEdge("test_runner", END);

export const builderGraph = workflow.compile();
