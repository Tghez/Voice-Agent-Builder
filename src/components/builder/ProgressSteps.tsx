"use client";

export interface ProgressStep {
  label: string;
  done: boolean;
}

/** Shimmer treatment shared with ThinkingIndicator (keyframe `shimmer` lives in
 *  the global stylesheet), applied to the one currently-active step. */
const SHIMMER =
  "text-transparent bg-clip-text bg-[linear-gradient(90deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.8)_50%,rgba(0,0,0,0.35)_100%)] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.85)_50%,rgba(255,255,255,0.35)_100%)] bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite]";

function StepIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="h-3 w-3 rounded-full border-[1.5px] border-black/20 dark:border-white/25 border-t-black/60 dark:border-t-white/70 animate-spin" />
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 animate-[thinking-fade-in_0.25s_ease-out]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Live checklist of real builder progress (editor + compiler), replacing the
 *  fake staged timer while an edit turn is working. The last step animates as
 *  active unless it reported itself done; earlier steps show a check. */
export function ProgressSteps({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex flex-col gap-1.5 rounded-2xl rounded-bl-sm bg-black/[0.04] dark:bg-white/[0.06] px-3.5 py-2.5">
        {steps.map((s, i) => {
          const active = !s.done && i === steps.length - 1;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex w-3.5 justify-center">
                <StepIcon active={active} />
              </span>
              <span
                className={
                  active ? "font-medium " + SHIMMER : "text-black/55 dark:text-white/55"
                }
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
