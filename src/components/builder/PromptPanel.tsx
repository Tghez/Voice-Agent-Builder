export function PromptPanel({ compiledPrompt }: { compiledPrompt: string | null }) {
  if (!compiledPrompt) {
    return <div className="text-sm text-black/50 dark:text-white/50">No compiled prompt yet.</div>;
  }

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/45 mb-2">
        Compiled prompt
      </div>
      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-3">
        <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words overflow-x-auto text-black/75 dark:text-white/75">
          {compiledPrompt}
        </pre>
      </div>
    </div>
  );
}
