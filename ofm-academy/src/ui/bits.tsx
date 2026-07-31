/**
 * Shared UI pieces. No copy lives here - every label is passed in from
 * content/strings (PRD 5.11).
 */

import type { ReactNode } from "react";
import { useUi } from "../state/ui";
import { strings } from "../content";

export function useT() {
  const lang = useUi((s) => s.lang);
  return { t: strings[lang], lang };
}

/**
 * Marks a value the game is showing but OFM has not confirmed. Deliberately
 * loud: nothing unconfirmed should ever read as fact (PRD 0.3).
 */
export function TodoConfirm({ title }: { title?: string }) {
  const { t } = useT();
  return (
    <span
      className="badge bg-ofm-orange/15 text-ofm-orange ring-1 ring-ofm-orange/40"
      title={title ?? t.confirm.body}
    >
      {t.confirm.badge}
    </span>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="text-ofm-orange" aria-label={`${n} / 3`}>
      {"★".repeat(n)}
      <span className="text-slate-300">{"★".repeat(3 - n)}</span>
    </span>
  );
}

/** OMR is always on screen - money is the universal language (PRD 5.11). */
export function OmrMeter({ omr }: { omr: number }) {
  const { t } = useT();
  const negative = omr < 0;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-widest text-slate-500">{t.hud.ledger}</span>
      <span
        className={`num text-xl font-extrabold ${negative ? "text-ofm-red" : "text-ofm-green"}`}
      >
        {omr > 0 ? "+" : ""}
        {omr}
      </span>
      <span className="text-xs font-semibold text-slate-500">{t.hud.omr}</span>
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {/* start/end so the fill grows right-to-left in Arabic */}
      <div
        className="h-full rounded-full bg-sls-blue transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold text-sls-ink">{children}</h2>;
}

/**
 * The consequence panel. Never says "wrong" - it says what it cost and why
 * (PRD 5.1 pillar 2).
 */
export function Consequence({
  messageEn,
  messageAr,
  omr,
}: {
  messageEn: string;
  messageAr: string;
  omr: number;
}) {
  const { t, lang } = useT();
  return (
    <div className="rounded-xl bg-ofm-red/5 p-4 ring-1 ring-ofm-red/30">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="badge bg-ofm-red/15 text-ofm-red">{t.level.consequence}</span>
        <span className="num font-extrabold text-ofm-red">
          {omr} {t.hud.omr}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">
        {lang === "ar" ? messageAr : messageEn}
      </p>
    </div>
  );
}
