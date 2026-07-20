import type { Lead } from "@/lib/providers/crm";

export function ConfirmCallDialog({
  lead,
  agentName,
  onCancel,
  onConfirm,
}: {
  lead: Lead;
  agentName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#141414] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-medium text-sm mb-1">Call {lead.name} now?</div>
        <div className="text-[13px] text-black/55 dark:text-white/55 mb-4">
          {agentName} will place a real call to {lead.name} at {lead.company}. This costs money and rings a
          real phone.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-sm rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-1.5"
          >
            Call now
          </button>
        </div>
      </div>
    </div>
  );
}
