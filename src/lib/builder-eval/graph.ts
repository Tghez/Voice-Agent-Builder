import { StateGraph, START, END } from "@langchain/langgraph";
import { BuilderAnnotation, type BuilderState } from "@/lib/builder/state";
import { routerNode } from "@/lib/builder/nodes/router";
import { editorNode } from "@/lib/builder/nodes/editor";

/**
 * Compiler-less mirror of the builder graph, used ONLY for evaluation:
 *
 *   START → router ─┬─ edit & clear → editor → END
 *                   └─ everything else ─────────→ END
 *
 * It reuses the REAL `routerNode` / `editorNode` implementations unchanged, so
 * the behaviour under test is exactly production's. It deliberately OMITS the
 * compiler and responder nodes:
 *   - no compiler  → an eval run never validates+PATCHes a Vapi assistant and
 *     never writes the DB (a test must be side-effect-free).
 *   - no responder → we assert on structured state (route / needsClarification /
 *     workingSpec), not on prose, so no extra LLM call is spent phrasing a reply.
 *
 * Running the nodes INSIDE a compiled graph (rather than calling them bare) is
 * load-bearing: `editorNode` calls `getWriter()`, which throws outside a
 * LangGraph run context. It also means LangGraph's native LangSmith integration
 * emits one child run per node, so each eval case is a readable nested trace.
 */
const workflow = new StateGraph(BuilderAnnotation)
  .addNode("router", routerNode)
  .addNode("editor", editorNode)
  .addEdge(START, "router")
  .addConditionalEdges(
    "router",
    (s: BuilderState) => (s.route === "edit" && !s.needsClarification ? "editor" : "end"),
    { editor: "editor", end: END },
  )
  .addEdge("editor", END);

export const builderEvalGraph = workflow.compile();
