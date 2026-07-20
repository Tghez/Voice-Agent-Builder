export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export function Tag({
  children,
  tone = "default",
  muted,
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "red" | "amber" | "blue";
  muted?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 dark:bg-white/10",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    red: "bg-red-500/10 text-red-700 dark:text-red-400",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${muted ? tones.default : tones[tone]}`}>
      {children}
    </span>
  );
}

/** true if a call's fit qualified and its intent is strong enough to call HOT. */
export function callBand(call: {
  structured_outcome?: { fit?: { qualified: boolean }; intent?: { intent_score: number } | null } | null;
}): "HOT" | "COLD" | null {
  const fit = call.structured_outcome?.fit;
  const intent = call.structured_outcome?.intent;
  if (!fit?.qualified) return null;
  return intent && intent.intent_score >= 60 ? "HOT" : "COLD";
}
