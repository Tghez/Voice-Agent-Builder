"use client";

import { useEffect, useRef } from "react";
import { Message } from "./Message";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { RAIL_WIDTH } from "./constants";
import type { ChatMessage } from "./types";

interface MessagesViewProps {
  started: boolean;
  panelOpen: boolean;
  messages: ChatMessage[];
  loading: boolean;
}

export function MessagesView({ started, panelOpen, messages, loading }: MessagesViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className={
        "fixed right-0 top-14 bottom-0 overflow-y-auto transition-[left,opacity] duration-[400ms] ease-in-out " +
        (started ? "opacity-100" : "opacity-0 pointer-events-none")
      }
      style={{ left: panelOpen ? RAIL_WIDTH : "0" }}
    >
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-40 space-y-4">
        {messages.map((m, i) => {
          const isPendingPlaceholder =
            loading && i === messages.length - 1 && m.role === "assistant" && m.text === "";
          if (isPendingPlaceholder) return null;
          return <Message key={i} m={m} />;
        })}
        {loading && messages[messages.length - 1]?.text === "" && <ThinkingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}
