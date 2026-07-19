import type { AgentOption } from "./types";

interface AgentsPanelProps {
  agents: AgentOption[];
  agentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function AgentsPanel({ agents, agentId, onSelect, onNew }: AgentsPanelProps) {
  return (
    <div className="space-y-1">
      <button
        onClick={onNew}
        className={
          "w-full text-left text-sm px-2.5 py-1.5 rounded-md transition-colors " +
          (agentId === null
            ? "bg-black/[0.06] dark:bg-white/10 font-medium"
            : "hover:bg-black/5 dark:hover:bg-white/10 text-black/70 dark:text-white/70")
        }
      >
        ＋ New agent
      </button>
      {agents.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a.id)}
          className={
            "w-full text-left text-sm px-2.5 py-1.5 rounded-md truncate transition-colors " +
            (agentId === a.id
              ? "bg-black/[0.06] dark:bg-white/10 font-medium"
              : "hover:bg-black/5 dark:hover:bg-white/10 text-black/70 dark:text-white/70")
          }
          title={a.name}
        >
          {a.name}
        </button>
      ))}
    </div>
  );
}
