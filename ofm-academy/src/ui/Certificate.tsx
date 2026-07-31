/**
 * Competency certificate.
 *
 * Printed via the browser's own print pipeline ("Save as PDF"), which is the
 * pattern already proven in this repo's quotation PDF - html2canvas produced
 * blank pages there, so it is deliberately not used here either. Costs
 * nothing, works offline, and produces a real artefact HR can file.
 *
 * The verification code is deterministic from the learner, rank and score, so
 * the printed code and the stored record can never disagree.
 */

import { useState } from "react";
import { RANKS, verifyCode, type BadgeId, type RankId } from "../data/progress";
import { Card, SectionTitle, useT } from "./bits";

export function Certificate({
  rank,
  badges,
  totalScore,
  levelsPassed,
}: {
  rank: RankId;
  badges: BadgeId[];
  totalScore: number;
  levelsPassed: number;
}) {
  const { t, lang } = useT();
  const [name, setName] = useState("");

  const rankDef = RANKS.find((r) => r.id === rank)!;
  const rankLabel = lang === "ar" ? rankDef.ar : rankDef.en;
  const code = verifyCode(name || "-", rank, totalScore);

  return (
    <div className="flex flex-col gap-4">
      <Card className="print:hidden">
        <SectionTitle>{t.progress.certificate}</SectionTitle>
        <label className="mt-3 block text-sm text-slate-600" htmlFor="learner">
          {t.progress.learnerName}
        </label>
        <input
          id="learner"
          className="tap mt-1 w-full rounded-xl px-4 py-3 text-lg ring-1 ring-slate-900/10"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn-primary mt-3 w-full"
          disabled={name.trim() === ""}
          onClick={() => window.print()}
        >
          {t.progress.print}
        </button>
      </Card>

      {/* the printable artefact itself */}
      <div className="card border-4 border-double border-sls-ink p-6 text-center print:border-2 print:shadow-none">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">{t.app.org}</div>
        <div className="mt-1 text-xl font-extrabold text-sls-ink">{t.app.title}</div>

        <div className="my-6">
          <div className="text-sm text-slate-500">{t.progress.certificate}</div>
          <div className="mt-2 text-3xl font-extrabold text-sls-ink">
            {name.trim() || "—"}
          </div>
          <div className="mt-3 inline-block rounded-full bg-sls-ink px-5 py-2 text-lg font-bold text-white">
            {rankLabel}
          </div>
        </div>

        <dl className="mx-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
          <dt className="text-start text-slate-500">{t.level.score}</dt>
          <dd className="num text-end font-bold">{totalScore}</dd>
          <dt className="text-start text-slate-500">{t.hud.progress}</dt>
          <dd className="num text-end font-bold">{levelsPassed}</dd>
          <dt className="text-start text-slate-500">{t.progress.verify}</dt>
          <dd className="num text-end font-bold tracking-widest">{code}</dd>
        </dl>

        {badges.length > 0 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {badges.map((b) => (
              <span key={b} className="badge bg-ofm-orange/15 text-ofm-orange">
                {t.badge[b]}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
