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
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">Identity</div>
        <div className="font-medium">{spec.identity.name}</div>
        <div className="text-black/60 dark:text-white/60 text-[13px]">{spec.identity.persona}</div>
        <div className="text-[12px] text-black/45 dark:text-white/45 mt-1">Voice: {spec.identity.voice}</div>
      </div>
      {spec.goal && (
        <Section label="Goal">
          <p className="text-[13px] text-black/70 dark:text-white/70">{spec.goal}</p>
        </Section>
      )}
      {spec.qualification.criteria.length > 0 && (
        <Section label={`Qualification · pass ${spec.qualification.scoring.passScore}`}>
          <ul className="space-y-1">
            {spec.qualification.criteria.map((c, i) => (
              <li key={i} className="text-[13px] text-black/70 dark:text-white/70">
                <span
                  className={c.gate ? "text-red-500 mr-1" : "text-yellow-500 mr-1"}
                  title={c.gate ? "must-have" : "nice-to-have"}
                >
                  ●
                </span>
                {c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-3 text-[11px] text-black/45 dark:text-white/45 mt-2">
            <span>
              <span className="text-red-500 mr-1">●</span>must-have
            </span>
            <span>
              <span className="text-yellow-500 mr-1">●</span>nice-to-have
            </span>
          </div>
        </Section>
      )}
      {spec.actions.length > 0 && (
        <Section label="Tools">
          <div className="flex flex-wrap gap-1">
            {spec.actions.map((a) => (
              <span key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">
                {a}
              </span>
            ))}
          </div>
        </Section>
      )}
      {spec.guardrails.length > 0 && (
        <Section label="Guardrails">
          <ul className="list-disc pl-4 space-y-0.5">
            {spec.guardrails.map((g, i) => (
              <li key={i} className="text-[13px] text-black/70 dark:text-white/70">
                {g}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
