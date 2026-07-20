import type { Lead } from "@/lib/providers/crm";

export function LeadsPanel({
  leads,
  busyId,
  disabled,
  onCall,
}: {
  leads: Lead[];
  busyId: string | null;
  disabled: boolean;
  onCall: (lead: Lead) => void;
}) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
      <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 font-medium text-sm">
        Leads ({leads.length})
      </div>
      <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        {leads.map((l) => (
          <li key={l.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {l.name} <span className="text-black/40 dark:text-white/40 font-normal">· {l.title}</span>
              </div>
              <div className="text-[13px] text-black/55 dark:text-white/55">{l.company}</div>
              <div className="text-[12px] text-black/45 dark:text-white/45 line-clamp-2 mt-0.5">{l.notes}</div>
            </div>
            <button
              onClick={() => onCall(l)}
              disabled={busyId === l.id || disabled}
              className="shrink-0 text-xs rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              {busyId === l.id ? "Calling…" : "Call"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
