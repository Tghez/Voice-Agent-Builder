"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AgentSpec } from "@/lib/spec/schema";
import { Hero } from "@/components/builder/Hero";
import { Composer } from "@/components/builder/Composer";
import { MessagesView } from "@/components/builder/MessagesView";
import { LeftRail, type TabId } from "@/components/builder/LeftRail";
import type { AgentOption, ChatMessage } from "@/components/builder/types";

export default function BuilderPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [spec, setSpec] = useState<AgentSpec | null>(null);
  const [compiledPrompt, setCompiledPrompt] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("agents");
  const started = messages.length > 0;

  /** Force the rail open on the Identity tab so the user can see that a
   *  create/edit just landed. Stays open until the user clicks the toggle
   *  button to close it. */
  function revealIdentity() {
    setActiveTab("identity");
    setRailOpen(true);
  }

  // Buffers incoming SSE token text and drains it word-by-word on a fixed
  // cadence, so the UI feels like a steady typewriter even when the network
  // delivers deltas in bursty, multi-word chunks.
  const revealRef = useRef<{
    pending: string;
    totalReceived: string;
    timer: ReturnType<typeof setInterval> | null;
    onDrain: (() => void) | null;
  }>({ pending: "", totalReceived: "", timer: null, onDrain: null });

  useEffect(() => {
    return () => {
      if (revealRef.current.timer) clearInterval(revealRef.current.timer);
    };
  }, []);

  const refreshAgents = useCallback(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

  async function loadAgent(id: string) {
    const data = await fetch(`/api/agents/${id}`).then((r) => r.json());
    if (data.error) return;
    setAgentId(id);
    setSpec(data.spec ?? null);
    setCompiledPrompt(data.compiledPrompt ?? null);
    setMessages([
      {
        role: "assistant",
        text: `Loaded ${data.agent.name}. Tell me what you'd like to change.`,
      },
    ]);
  }

  function updateLastMessage(patch: Partial<ChatMessage>) {
    setMessages((m) => {
      if (m.length === 0) return m;
      const next = [...m];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }

  function appendToLastMessage(chunk: string) {
    setMessages((m) => {
      if (m.length === 0) return m;
      const next = [...m];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, text: last.text + chunk };
      return next;
    });
  }

  /** Drains `reveal.pending` a word at a time on a fixed cadence (speeding up
   *  if a big backlog has built up), so bursty network chunks still read as
   *  a smooth typewriter. Calls `onDrain` once fully caught up. */
  function startReveal(reveal: typeof revealRef.current) {
    if (reveal.timer) return;
    reveal.timer = setInterval(() => {
      const wordsPerTick = reveal.pending.length > 400 ? 3 : reveal.pending.length > 150 ? 2 : 1;
      let chunk = "";
      for (let i = 0; i < wordsPerTick; i++) {
        const match = reveal.pending.match(/^\s*\S+/);
        if (!match) break;
        chunk += match[0];
        reveal.pending = reveal.pending.slice(match[0].length);
      }
      if (chunk) appendToLastMessage(chunk);
      if (!reveal.pending) {
        if (reveal.timer) {
          clearInterval(reveal.timer);
          reveal.timer = null;
        }
        const onDrain = reveal.onDrain;
        reveal.onDrain = null;
        onDrain?.();
      }
    }, 22);
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    // Prior turns of this session (before adding the current one) = the history.
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setInput("");
    setLoading(true);

    const reveal = revealRef.current;
    if (reveal.timer) clearInterval(reveal.timer);
    reveal.pending = "";
    reveal.totalReceived = "";
    reveal.timer = null;
    reveal.onDrain = null;

    function pushToken(chunk: string) {
      reveal.totalReceived += chunk;
      reveal.pending += chunk;
      startReveal(reveal);
    }

    try {
      const res = await fetch("/api/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agentId, history }),
      });
      if (!res.body) {
        const data = await res.json().catch(() => ({}));
        updateLastMessage({ text: `Error: ${data.error || res.statusText}` });
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          let dataLine = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine);

          if (event === "token") {
            pushToken(parsed.text ?? "");
          } else if (event === "done") {
            // Reconcile against the authoritative final reply in case it
            // diverges from the summed deltas (e.g. a trimmed fallback).
            const leftover =
              typeof parsed.reply === "string" && parsed.reply.length > reveal.totalReceived.length
                ? parsed.reply.slice(reveal.totalReceived.length)
                : "";
            if (leftover) pushToken(leftover);

            reveal.onDrain = () => {
              updateLastMessage({
                meta: { route: parsed.route, diff: parsed.diff, testCall: parsed.testCall },
              });
              if (parsed.agentId) {
                setAgentId(parsed.agentId);
                refreshAgents(); // surface a newly created agent in the picker
              }
              if (parsed.spec) setSpec(parsed.spec);
              if (parsed.compiledPrompt) setCompiledPrompt(parsed.compiledPrompt);
              // diffSpecs() leaves `changes` empty for a brand-new agent (there's
              // no "before" to diff against) and only populates `summary` — so
              // check summary, not changes, to catch creation as well as edits.
              if (parsed.diff?.summary?.some((s: string) => s !== "No changes.")) revealIdentity();
              setLoading(false);
            };
            if (!reveal.pending && !reveal.timer) {
              const onDrain = reveal.onDrain;
              reveal.onDrain = null;
              onDrain?.();
            }
          } else if (event === "error") {
            if (reveal.timer) {
              clearInterval(reveal.timer);
              reveal.timer = null;
            }
            reveal.pending = "";
            updateLastMessage({ text: `Error: ${parsed.error}` });
            setLoading(false);
          }
        }
      }
    } catch (e) {
      if (reveal.timer) {
        clearInterval(reveal.timer);
        reveal.timer = null;
      }
      updateLastMessage({ text: `Error: ${(e as Error).message}` });
      setLoading(false);
    }
  }

  function reset() {
    setMessages([]);
    setAgentId(null);
    setSpec(null);
    setCompiledPrompt(null);
  }

  return (
    <>
      <Hero started={started} panelOpen={railOpen} />
      <MessagesView started={started} panelOpen={railOpen} messages={messages} loading={loading} />
      <Composer
        started={started}
        panelOpen={railOpen}
        value={input}
        onChange={setInput}
        onSubmit={() => send(input)}
        loading={loading}
      />
      <LeftRail
        agents={agents}
        agentId={agentId}
        spec={spec}
        compiledPrompt={compiledPrompt}
        onSelectAgent={loadAgent}
        onNewAgent={reset}
        open={railOpen}
        onToggle={() => setRailOpen((v) => !v)}
        tab={activeTab}
        onTabChange={setActiveTab}
      />
    </>
  );
}
