/**
 * The PROVE stage of the loop (PRD 5.2). Shows what the shift cost and where
 * the money went - never a bare "wrong".
 */

import { fill } from "../content";
import type { FinishedRun } from "../levels/LevelHost";
import { Card, OmrMeter, SectionTitle, Stars, useT } from "./bits";

export function ResultScreen({
  run,
  onRetry,
  onHome,
}: {
  run: FinishedRun;
  onRetry(): void;
  onHome(): void;
}) {
  const { t } = useT();
  const { result, replayBytes, replayVerified } = run;
  const breakdown = [...result.ledger].length > 0;

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <SectionTitle>{t.result.title}</SectionTitle>
        <div className="my-2 text-5xl">
          <Stars n={result.stars} />
        </div>
        <div className="num text-3xl font-extrabold text-sls-ink">{result.score}</div>
        <div className="text-sm text-slate-500">{t.level.score}</div>
        <div className="mt-3 flex justify-center">
          <OmrMeter omr={result.omr} />
        </div>
      </Card>

      <Card>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.level.accuracy}</dt>
          <dd className="num text-end font-semibold">{pct(result.parts.accuracy)}</dd>
          <dt className="text-slate-500">{t.level.speed}</dt>
          <dd className="num text-end font-semibold">{pct(result.parts.speed)}</dd>
          <dt className="text-slate-500">{t.level.cost}</dt>
          <dd className="num text-end font-semibold">{pct(result.parts.cost)}</dd>
          <dt className="text-slate-500">{t.level.safety}</dt>
          <dd className="num text-end font-semibold">{pct(result.parts.safety)}</dd>
        </dl>
      </Card>

      <Card>
        <SectionTitle>{t.result.breakdown}</SectionTitle>
        {breakdown ? (
          <ul className="mt-2 grid gap-1 text-sm">
            {result.ledger.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-slate-600">
                  {t.reason[e.reason] ?? e.reason}
                </span>
                <span
                  className={`num font-bold ${e.omr < 0 ? "text-ofm-red" : "text-ofm-green"}`}
                >
                  {e.omr > 0 ? "+" : ""}
                  {e.omr}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ofm-green">{t.result.noCost}</p>
        )}
      </Card>

      {/* Command-stream replay: seed + commands, not video (PRD 9.1). */}
      <Card className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-sls-ink">{t.result.replaySaved}</div>
          <div className="num text-xs text-slate-500">
            {fill(t.result.replaySize, { bytes: replayBytes })}
          </div>
        </div>
        <span
          className={`badge ${
            replayVerified
              ? "bg-ofm-green/15 text-ofm-green"
              : "bg-ofm-orange/15 text-ofm-orange"
          }`}
        >
          {replayVerified ? "OK" : t.confirm.badge}
        </span>
      </Card>

      <div className="flex gap-3">
        <button className="btn-primary flex-1" onClick={onRetry}>
          {t.level.tryAgain}
        </button>
        <button className="btn-ghost flex-1" onClick={onHome}>
          {t.nav.chapters}
        </button>
      </div>
    </div>
  );
}
