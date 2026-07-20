import { RAIL_WIDTH } from "./constants";

/** Pre-chat centered headline. Fades and shrinks out of the way once the
 *  conversation starts, and re-centers within the right 80% while the left
 *  panel is open. Positioned with an inline transform (rather than Tailwind
 *  translate utilities) so nothing else touches the `transform` property. */
export function Hero({ started, panelOpen }: { started: boolean; panelOpen: boolean }) {
  const x = panelOpen ? `calc(-50% + (${RAIL_WIDTH}) / 2)` : "-50%";
  const y = started ? "calc(42vh - 190px)" : "calc(42vh - 170px)";
  const scale = started ? 0.96 : 1;
  return (
    <div
      className={
        "fixed left-1/2 top-0 z-20 w-full max-w-2xl px-4 text-center transition-all duration-[400ms] ease-in-out " +
        (started ? "opacity-0 pointer-events-none" : "opacity-100")
      }
      style={{ transform: `translate(${x}, ${y}) scale(${scale})` }}
    >
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
        What voice agent should we build today?
      </h1>
      <p className="mt-3 text-sm text-black/50 dark:text-white/50">
        Think of the agent you want — who it is, what it qualifies, what it should do.
      </p>
    </div>
  );
}
