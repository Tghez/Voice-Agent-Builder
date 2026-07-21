export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.07] dark:border-white/[0.08] pt-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/45 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
