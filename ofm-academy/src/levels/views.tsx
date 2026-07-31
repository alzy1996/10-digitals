/**
 * Level views. One primary task per screen, big targets, instant feedback
 * (PRD 5.11). Every string comes from content.
 */

import { useState } from "react";
import { fill } from "../content";
import { Card, Consequence, ProgressBar, TodoConfirm, useT } from "../ui/bits";
import type { LevelApi } from "./LevelHost";
import type {
  CodeBreakerState,
  DeadlineState,
  GhostSoState,
  GlossaryState,
  MtBagsState,
  ReadSoState,
  SoField,
} from "./defs";
import { SO_FIELDS } from "./defs";
import * as V2 from "./views2";

/** Shows whatever the last command broke, in the learner's language. */
function Violations({ api }: { api: LevelApi<unknown> }) {
  if (api.violations.length === 0) return null;
  const v = api.violations[0];
  return (
    <Consequence messageEn={v.messageEn} messageAr={v.messageAr} omr={-v.costOMR} />
  );
}

/* ------------------------------------------------------------------ 0.2 */

export function GlossaryView({ api }: { api: LevelApi<GlossaryState> }) {
  const { t } = useT();
  const s = api.state;
  const current = s.pairs[s.index];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l0_2.prompt}</div>
        <div className="mt-1 text-3xl font-extrabold text-sls-ink">{current?.en ?? "—"}</div>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {t.l0_2.remaining}: <b className="num">{s.pairs.length - s.index}</b>
        </span>
        <ProgressBar value={s.index} max={s.pairs.length} />
      </div>

      <div className="grid gap-3">
        {s.choices.map((ar) => (
          <button
            key={ar}
            className="btn-choice"
            disabled={s.matched.length >= s.pairs.length}
            onClick={() => api.submit("match", { ar })}
          >
            {ar}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 1.1 */

export function ReadSoView({ api }: { api: LevelApi<ReadSoState> }) {
  const { t } = useT();
  const s = api.state;
  const [active, setActive] = useState<string | null>(null);

  const labels: Record<SoField, string> = {
    customer: t.l1_1.fieldCustomer,
    product: t.l1_1.fieldProduct,
    mt: t.l1_1.fieldMt,
    bags: t.l1_1.fieldBags,
    deadline: t.l1_1.fieldDeadline,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* the document, as printed */}
      <Card className="border-s-4 border-s-sls-ink">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-sls-ink">
            {t.l1_1.docTitle}
          </span>
          <TodoConfirm title={t.l1_1.docNote} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{labels.customer}</dt>
          <dd className="text-end font-semibold">{s.doc.customer}</dd>
          <dt className="text-slate-500">{labels.product}</dt>
          <dd className="num text-end font-semibold">{s.doc.product}</dd>
          <dt className="text-slate-500">{labels.mt}</dt>
          <dd className="num text-end font-semibold">{s.doc.mt}</dd>
          <dt className="text-slate-500">{labels.bags}</dt>
          <dd className="num text-end font-semibold">{s.doc.bags}</dd>
          <dt className="text-slate-500">{labels.deadline}</dt>
          <dd className="num text-end font-semibold">{s.doc.deadline}</dd>
        </dl>
      </Card>

      <div className="text-sm text-slate-600">{t.l1_1.tapToFill}</div>

      {/* the slots */}
      <div className="grid gap-2">
        {SO_FIELDS.map((f) => (
          <button
            key={f}
            className={`btn-choice flex items-center justify-between ${
              active === f ? "ring-2 ring-sls-blue" : ""
            }`}
            onClick={() => setActive(f)}
          >
            <span className="text-sm text-slate-500">{labels[f]}</span>
            <span className="num font-bold">
              {s.filled[f] ?? <span className="text-slate-300">{t.l1_1.slotEmpty}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* the values */}
      <div className="flex flex-wrap gap-2">
        {s.options.map((o, i) => (
          <button
            key={`${o.value}-${i}`}
            className="tap rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-slate-900/10 hover:bg-slate-50"
            disabled={active === null}
            onClick={() => {
              if (active) api.submit("assign", { field: active, value: o.value });
              setActive(null);
            }}
          >
            {o.value}
          </button>
        ))}
      </div>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 1.2 */

export function CodeBreakerView({ api }: { api: LevelApi<CodeBreakerState> }) {
  const { t } = useT();
  const s = api.state;
  const round = s.rounds[s.index];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l1_2.prompt}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="num text-4xl font-extrabold tracking-widest text-sls-ink">
            {round?.asked ?? "—"}
          </span>
          <TodoConfirm title={t.confirm.productNames} />
        </div>
        <p className="mt-2 text-sm text-slate-500">{t.l1_2.hint}</p>
      </Card>

      <ProgressBar value={s.index} max={s.rounds.length} />

      <div className="grid grid-cols-2 gap-3">
        {round?.choices.map((code) => (
          <button
            key={code}
            className="btn-choice num text-center text-2xl tracking-widest"
            onClick={() => api.submit("choose", { code })}
          >
            {code}
          </button>
        ))}
      </div>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 1.3 */

export function MtBagsView({ api }: { api: LevelApi<MtBagsState> }) {
  const { t } = useT();
  const s = api.state;
  const q = s.questions[s.index];
  const [value, setValue] = useState("");

  if (!q) return null;

  const prompt = q.toBags
    ? fill(t.l1_3.promptToBags, { mt: q.mt })
    : fill(t.l1_3.promptToMt, { bags: Math.round(q.mt * 40) });

  const submit = () => {
    if (value.trim() === "") return;
    api.submit("answer", { value: Number(value) });
    setValue("");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-2xl font-extrabold text-sls-ink">{prompt}</div>
        <div className="mt-1 text-sm text-slate-500">
          {t.l1_3.streak}: <b className="num">{s.streak}</b>
        </div>
      </Card>

      <ProgressBar value={s.index} max={s.questions.length} />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="num tap w-full rounded-xl px-4 py-3 text-2xl font-bold ring-1 ring-slate-900/10"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={q.toBags ? t.l1_3.unitBags : t.l1_3.unitMt}
        />
        <button className="btn-primary" type="submit">
          {t.nav.next}
        </button>
      </form>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 1.4 */

export function DeadlineView({ api }: { api: LevelApi<DeadlineState> }) {
  const { t } = useT();
  const s = api.state;
  const [order, setOrder] = useState(s.orders.map((o) => o.id));

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-slate-600">{t.l1_4.prompt}</div>

      <div className="grid gap-2">
        {order.map((id, idx) => {
          const o = s.orders.find((x) => x.id === id)!;
          return (
            <Card key={id} className="flex items-center gap-3">
              <span className="num w-6 text-lg font-extrabold text-slate-400">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{o.customer}</div>
                <div className="num text-xs text-slate-500">
                  {o.code} · {o.mt} MT · {t.l1_4.transitNote} {o.transitH}h · {o.dueInH}h
                  {o.requiresFerry ? ` · ${t.l1_4.ferryNote}` : ""}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn-ghost !px-2 !py-1" onClick={() => move(id, -1)}>
                  ▲
                </button>
                <button className="btn-ghost !px-2 !py-1" onClick={() => move(id, 1)}>
                  ▼
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <button className="btn-primary" onClick={() => api.submit("commit", { order })}>
        {t.l1_4.commit}
      </button>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 1.5 */

export function GhostSoView({ api }: { api: LevelApi<GhostSoState> }) {
  const { t } = useT();
  const s = api.state;
  const found = s.guess === s.missingId;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-sls-ink">
            {t.l1_5.inbox}
          </div>
          <ul className="num grid gap-1 text-sm">
            {s.inbox.map((id) => (
              <li key={id} className="rounded bg-slate-50 px-2 py-1">
                {id}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {t.l1_5.list}
          </div>
          <ul className="num grid gap-1 text-sm">
            {s.list.map((id) => (
              <li key={id} className="rounded bg-slate-50 px-2 py-1">
                {id}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="text-sm text-slate-600">{t.l1_5.prompt}</div>

      <div className="grid grid-cols-2 gap-2">
        {s.inbox.map((id) => (
          <button
            key={id}
            className={`btn-choice num text-center ${
              found && id === s.missingId ? "btn-choice-good" : ""
            }`}
            disabled={found}
            onClick={() => api.submit("guess", { id })}
          >
            {id}
          </button>
        ))}
      </div>

      <button className="btn-primary" disabled={!found} onClick={() => api.submit("report")}>
        {t.l1_5.report}
      </button>

      {s.reported ? (
        <div className="rounded-xl bg-ofm-green/10 p-4 text-sm font-semibold text-ofm-green ring-1 ring-ofm-green/30">
          {t.l1_5.reported}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ dispatch */

/* eslint-disable @typescript-eslint/no-explicit-any */
export const LEVEL_VIEWS: Record<string, (p: { api: LevelApi<any> }) => JSX.Element | null> = {
  "0.2": GlossaryView,
  "1.1": ReadSoView,
  "1.2": CodeBreakerView,
  "1.3": MtBagsView,
  "1.4": DeadlineView,
  "1.5": GhostSoView,
  "3.2": V2.ScaleView,
  "3.3": V2.FreeKilosView,
  "6.1": V2.BaggedOrBulkView,
  "6.3": V2.ContractBoardView,
  "6.4": V2.SoharPoultryView,
  "6.6": V2.NoContractView,
  "6.7": V2.FerryView,
  "8.2": V2.LabourForecastView,
  "8.5": V2.LeaveChainView,
  "8.6": V2.GhostHourView,
};
