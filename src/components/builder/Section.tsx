export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-3">
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1">{label}</div>
      {children}
    </div>
  );
}
