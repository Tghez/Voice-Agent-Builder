import type { SpecDiff } from "@/lib/builder/diff";

export interface AgentOption {
  id: string;
  name: string;
}

export interface AssistantMeta {
  route?: string | null;
  diff?: SpecDiff | null;
  testCall?: { note: string } | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  meta?: AssistantMeta;
}
