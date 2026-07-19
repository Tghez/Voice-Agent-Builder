import { FormattedText } from "./FormattedText";
import type { ChatMessage } from "./types";

export function Message({ m }: { m: ChatMessage }) {
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
        <div className="rounded-2xl rounded-bl-sm bg-black/[0.04] dark:bg-white/[0.06] px-3.5 py-2 text-sm">
          <FormattedText text={m.text} />
        </div>
        {m.meta?.diff && m.meta.diff.summary.some((s) => s !== "No changes.") && (
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
