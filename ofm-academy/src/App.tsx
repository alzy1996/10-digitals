import { useEffect, useState } from "react";
import { Shell } from "./ui/Shell";
import { Card, OmrMeter, ProgressBar, SectionTitle, Stars, useT } from "./ui/bits";
import { ResultScreen } from "./ui/ResultScreen";
import { CHAPTERS, BUILT_LEVELS, TOTAL_PLANNED, levelEntry } from "./levels/registry";
import { useLevel } from "./levels/LevelHost";
import { LEVEL_VIEWS } from "./levels/views";
import { useUi } from "./state/ui";
import { Certificate } from "./ui/Certificate";
import { RANKS } from "./data/progress";
import type { Strings } from "./content/strings.en";

/** Level title and objective, both from content. */
function levelCopy(t: Strings, levelId: string) {
  const entry = levelEntry(levelId);
  if (!entry) return { title: levelId, objective: "" };
  const block = t[entry.titleKey] as { title: string; objective: string };
  return { title: block.title, objective: block.objective };
}

function RankCard() {
  const { t, lang } = useT();
  const rank = useUi((s) => s.rank);
  const badges = useUi((s) => s.badges);
  const go = useUi((s) => s.go);
  const def = RANKS.find((r) => r.id === rank)!;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">
            {t.progress.rank}
          </div>
          <div className="text-lg font-extrabold text-sls-ink">
            {lang === "ar" ? def.ar : def.en}
          </div>
        </div>
        <button className="btn-ghost !px-4 !py-2 text-sm" onClick={() => go({ name: "certificate" })}>
          {t.progress.certificate}
        </button>
      </div>
      {badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b} className="badge bg-ofm-orange/15 text-ofm-orange">
              {t.badge[b]}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CertificateScreen() {
  const best = useUi((s) => s.best);
  const rank = useUi((s) => s.rank);
  const badges = useUi((s) => s.badges);
  const attempts = Object.values(best);
  const totalScore = attempts.reduce((n, a) => n + a.score, 0);
  const levelsPassed = attempts.filter((a) => a.stars >= 1).length;

  return (
    <Certificate
      rank={rank}
      badges={badges}
      totalScore={totalScore}
      levelsPassed={levelsPassed}
    />
  );
}

function Home() {
  const { t } = useT();
  const go = useUi((s) => s.go);
  const best = useUi((s) => s.best);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle>{t.app.subtitle}</SectionTitle>
        <p className="mt-1 text-sm text-slate-600">{t.app.tagline}</p>
        <div className="mt-3">
          <ProgressBar value={BUILT_LEVELS.length} max={TOTAL_PLANNED} />
          <div className="num mt-1 text-xs text-slate-500">
            {BUILT_LEVELS.length} / {TOTAL_PLANNED}
          </div>
        </div>
      </Card>

      <RankCard />

      <div className="grid gap-3">
        {CHAPTERS.map((c) => {
          const playable = c.levels.filter((l) => l.built);
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sls-ink">{t.chapter[c.key]}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.roles.join(" · ")}</div>
                </div>
                <span className="num shrink-0 text-xs text-slate-400">
                  {playable.length}/{c.plannedLevels}
                </span>
              </div>

              {playable.length === 0 ? (
                <div className="mt-2 text-sm text-slate-400">{t.chapter.comingSoon}</div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {playable.map((l) => {
                    const copy = levelCopy(t, l.id);
                    const b = best[l.id];
                    return (
                      <button
                        key={l.id}
                        className="btn-choice flex items-center justify-between gap-3"
                        onClick={() => go({ name: "level", levelId: l.id })}
                      >
                        <span className="min-w-0">
                          <span className="num me-2 text-slate-400">{l.id}</span>
                          <span className="font-semibold">{copy.title}</span>
                        </span>
                        {b ? <Stars n={b.stars} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LevelScreen({ levelId }: { levelId: string }) {
  const { t } = useT();
  const go = useUi((s) => s.go);
  const record = useUi((s) => s.recordResult);
  // changing the attempt key remounts the host with a fresh seed
  const [attempt, setAttempt] = useState(0);

  return (
    <LevelRunner
      key={`${levelId}:${attempt}`}
      levelId={levelId}
      attempt={attempt}
      onRetry={() => setAttempt((n) => n + 1)}
      onHome={() => go({ name: "home" })}
      onRecord={record}
      t={t}
    />
  );
}

function LevelRunner({
  levelId,
  attempt,
  onRetry,
  onHome,
  onRecord,
  t,
}: {
  levelId: string;
  attempt: number;
  onRetry(): void;
  onHome(): void;
  onRecord(levelId: string, score: number, stars: 0 | 1 | 2 | 3, omr: number): void;
  t: Strings;
}) {
  const { api, finished } = useLevel<unknown>(levelId, `attempt-${attempt}`);
  const copy = levelCopy(t, levelId);
  const View = LEVEL_VIEWS[levelId];

  if (finished) {
    onRecord(levelId, finished.result.score, finished.result.stars, finished.result.omr);
    return <ResultScreen run={finished} onRetry={onRetry} onHome={onHome} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="num text-xs text-slate-400">{levelId}</div>
          <h1 className="text-xl font-extrabold text-sls-ink">{copy.title}</h1>
        </div>
        <OmrMeter omr={api.omr} />
      </div>

      <p className="text-sm text-slate-600">{copy.objective}</p>

      {View ? <View api={api} /> : null}

      <button className="btn-ghost" onClick={api.finish}>
        {t.nav.finish}
      </button>
    </div>
  );
}

export default function App() {
  const route = useUi((s) => s.route);
  const hydrate = useUi((s) => s.hydrate);

  // pull saved progress once; the repository is offline-first
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Shell>
      {route.name === "level" ? (
        <LevelScreen levelId={route.levelId} />
      ) : route.name === "certificate" ? (
        <CertificateScreen />
      ) : (
        <Home />
      )}
    </Shell>
  );
}
