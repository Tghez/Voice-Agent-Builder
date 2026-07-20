"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEvalRun, isEvalRunning } from "@/lib/evalRunStore";

const links = [
  { href: "/", label: "Builder" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/evals", label: "Evals" },
];

export function Nav() {
  const path = usePathname();
  const evalRunning = isEvalRunning(useEvalRun());
  return (
    <header className="border-b border-black/10 dark:border-white/10 bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
        <span className="font-semibold tracking-tight">
          Voice Agent Builder
        </span>
        <nav className="flex gap-1 text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 " +
                  (active
                    ? "bg-black/[0.06] dark:bg-white/10 font-medium"
                    : "text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white")
                }
              >
                {l.label}
                {l.href === "/evals" && evalRunning && (
                  <span
                    className="relative inline-flex h-2 w-2"
                    title="An evaluation is running"
                    aria-label="An evaluation is running"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
