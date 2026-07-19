export function PromptPanel({ compiledPrompt }: { compiledPrompt: string | null }) {
  if (!compiledPrompt) {
    return <div className="text-sm text-black/50 dark:text-white/50">No compiled prompt yet.</div>;
  }

  return (
    <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap overflow-x-auto">{compiledPrompt}</pre>
  );
}
