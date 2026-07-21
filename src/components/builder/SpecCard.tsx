import type { AgentSpec } from "@/lib/spec/schema";
import { Section } from "./Section";

/** Identity panel content. Rendered inside a HoverTab panel, which already
 *  supplies the card chrome (border/background/padding), so this only
 *  renders the inner content. */
export function SpecCard({ spec }: { spec: AgentSpec | null }) {
  if (!spec) {
    return <div className="text-sm text-black/50 dark:text-white/50">No agent yet. Describe one to get started.</div>;
  }
  return (
    <div className="space-y-4">
      {/* Identity header */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/45 mb-1.5">
          Identity
        </div>
        <div className="text-[15px] font-semibold leading-tight">{spec.identity.name}</div>
        <p className="text-[13px] leading-relaxed text-black/60 dark:text-white/60 mt-1">{spec.identity.persona}</p>
        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-black/55 dark:text-white/55">
            <span className="text-black/35 dark:text-white/35">Voice</span>
            <span className="font-medium text-black/70 dark:text-white/70">{spec.identity.voice}</span>
          </span>
        </div>
      </div>

      {spec.identity.firstMessage && (
        <Section label="First message">
          <blockquote className="text-[13px] leading-relaxed text-black/70 dark:text-white/70 italic border-l-2 border-black/15 dark:border-white/20 pl-3 py-0.5">
            “{spec.identity.firstMessage}”
          </blockquote>
        </Section>
      )}

      {spec.goal && (
        <Section label="Goal">
          <p className="text-[13px] leading-relaxed text-black/70 dark:text-white/70">{spec.goal}</p>
        </Section>
      )}

      {spec.qualification.criteria.length > 0 && (
        <Section label={`Qualification · pass ${spec.qualification.scoring.passScore}`}>
          <ul className="space-y-1.5">
            {spec.qualification.criteria.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px] leading-relaxed text-black/70 dark:text-white/70 rounded-lg px-2.5 py-1.5 bg-black/[0.03] dark:bg-white/[0.04]"
              >
                <span
                  className={"mt-[3px] shrink-0 " + (c.gate ? "text-red-500" : "text-yellow-500")}
                  title={c.gate ? "must-have" : "nice-to-have"}
                >
                  ●
                </span>
                <span className="min-w-0">{c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-3 text-[11px] text-black/45 dark:text-white/45 mt-2">
            <span className="inline-flex items-center gap-1">
              <span className="text-red-500">●</span>must-have
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-yellow-500">●</span>nice-to-have
            </span>
          </div>
        </Section>
      )}

      {spec.actions.length > 0 && (
        <Section label="Tools">
          <div className="flex flex-wrap gap-1.5">
            {spec.actions.map((a) => (
              <span
                key={a}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-black/70 dark:text-white/70"
              >
                {a}
              </span>
            ))}
          </div>
        </Section>
      )}

      {spec.guardrails.length > 0 && (
        <Section label="Guardrails">
          <ul className="list-disc pl-4 space-y-1">
            {spec.guardrails.map((g, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-black/70 dark:text-white/70">
                {g}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
