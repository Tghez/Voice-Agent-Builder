"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AgentSpec } from "@/lib/spec/schema";
import type { SpecDiff } from "@/lib/builder/diff";

interface AgentOption {
  id: string;
  name: string;
}

interface AssistantMeta {
  route?: string | null;
  diff?: SpecDiff | null;
  testCall?: { note: string } | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  meta?: AssistantMeta;
}

export default function BuilderPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [spec, setSpec] = useState<AgentSpec | null>(null);
  const [compiledPrompt, setCompiledPrompt] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (revealRef.current.timer) clearInterval(revealRef.current.timer);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
    setShowPrompt(false);
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
    setShowPrompt(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Chat */}
      <section className="flex flex-col rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] min-h-[70vh]">
        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
          <div>
            <h1 className="font-semibold">Builder</h1>
            <p className="text-xs text-black/50 dark:text-white/50">
              {agentId ? "Editing agent" : "Describe the agent you want"}
            </p>
          </div>
          <select
            value={agentId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) reset();
              else loadAgent(v);
            }}
            className="text-xs rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5"
          >
            <option value="">＋ New agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            <Message key={i} m={m} />
          ))}
          {loading && messages[messages.length - 1]?.text === "" && (
            <div className="text-sm text-black/40 dark:text-white/40">Thinking…</div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-black/10 dark:border-white/10 p-3 flex gap-2 items-end"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Describe or edit the agent…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/30 max-h-[200px] overflow-y-auto"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="shrink-0 grid place-items-center h-9 w-9 rounded-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:opacity-80 transition-opacity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </section>

      {/* Spec panel */}
      <aside className="space-y-4">
        <SpecCard spec={spec} />
        {compiledPrompt && (
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
            >
              View compiled prompt
              <span className="text-black/40 dark:text-white/40">{showPrompt ? "−" : "+"}</span>
            </button>
            {showPrompt && (
              <pre className="border-t border-black/10 dark:border-white/10 px-4 py-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto max-h-[50vh]">
                {compiledPrompt}
              </pre>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-black text-white dark:bg-white dark:text-black px-3.5 py-2 text-sm">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="rounded-2xl rounded-bl-sm bg-black/[0.04] dark:bg-white/[0.06] px-3.5 py-2 text-sm whitespace-pre-wrap">
          {m.text}
        </div>
        {m.meta?.diff && m.meta.diff.changes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.meta.diff.summary.map((s, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {m.meta?.testCall && (
          <a
            href="/dashboard"
            className="inline-block text-[12px] px-2.5 py-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Go to dashboard to place the call →
          </a>
        )}
      </div>
    </div>
  );
}

function SpecCard({ spec }: { spec: AgentSpec | null }) {
  if (!spec) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 text-sm text-black/50 dark:text-white/50">
        No agent yet. Describe one to get started.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 space-y-3 text-sm">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">Identity</div>
        <div className="font-medium">{spec.identity.name}</div>
        <div className="text-black/60 dark:text-white/60 text-[13px]">{spec.identity.persona}</div>
        <div className="text-[12px] text-black/45 dark:text-white/45 mt-1">Voice: {spec.identity.voice}</div>
      </div>
      {spec.goal && (
        <Section label="Goal">
          <p className="text-[13px] text-black/70 dark:text-white/70">{spec.goal}</p>
        </Section>
      )}
      {spec.qualification.criteria.length > 0 && (
        <Section label={`Qualification · pass ${spec.qualification.scoring.passScore}`}>
          <ul className="space-y-1">
            {spec.qualification.criteria.map((c, i) => (
              <li key={i} className="text-[13px] text-black/70 dark:text-white/70">
                {c.gate && (
                  <span className="text-red-500 mr-1" title="hard gate">
                    ●
                  </span>
                )}
                {c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {spec.actions.length > 0 && (
        <Section label="Tools">
          <div className="flex flex-wrap gap-1">
            {spec.actions.map((a) => (
              <span key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">
                {a}
              </span>
            ))}
          </div>
        </Section>
      )}
      {spec.guardrails.length > 0 && (
        <Section label="Guardrails">
          <ul className="list-disc pl-4 space-y-0.5">
            {spec.guardrails.map((g, i) => (
              <li key={i} className="text-[13px] text-black/70 dark:text-white/70">
                {g}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-3">
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1">{label}</div>
      {children}
    </div>
  );
}
