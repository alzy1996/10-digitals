/**
 * Views for chapters 3, 6 and 8.
 */

import { useState } from "react";
import { transporters } from "../content";
import { Card, Consequence, ProgressBar, TodoConfirm, useT } from "../ui/bits";
import type { LevelApi } from "./LevelHost";
import type {
  ContractBoardState,
  FerryState,
  FormForkState,
  FreeKilosState,
  GhostHourState,
  LabourState,
  LeaveChainState,
  ScaleState,
  SoharTrapState,
} from "./defs2";

function Violations({ api }: { api: LevelApi<unknown> }) {
  if (api.violations.length === 0) return null;
  const v = api.violations[0];
  return <Consequence messageEn={v.messageEn} messageAr={v.messageAr} omr={-v.costOMR} />;
}

/* ------------------------------------------------------------------ 3.2 */

export function ScaleView({ api }: { api: LevelApi<ScaleState> }) {
  const { t } = useT();
  const s = api.state;
  const last = s.deviations[s.deviations.length - 1];
  const avg =
    s.deviations.length > 0
      ? Math.round(s.deviations.reduce((a, g) => a + Math.abs(g), 0) / s.deviations.length)
      : 0;

  // needle position as a share of the dial, 25.0 kg sits at 71%
  const pct = Math.min(100, (s.needle / 35) * 100);
  const over = s.needle > 25;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            {t.l3_2.bag} {s.index + 1} / {s.bags}
          </span>
          <span className="num text-3xl font-extrabold text-sls-ink">
            {s.needle.toFixed(2)} kg
          </span>
        </div>

        {/* the dial: the mark sits where 25.0 kg falls */}
        <div className="relative mt-3 h-6 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full transition-none ${over ? "bg-ofm-red" : "bg-ofm-green"}`}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-0 h-full w-1 bg-sls-ink"
            style={{ insetInlineStart: `${(25 / 35) * 100}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>
            {t.l3_2.deviation}: <b className="num">{avg} {t.l3_2.grams}</b>
          </span>
          {last !== undefined ? (
            <span className={last > 0 ? "text-ofm-red" : "text-ofm-green"}>
              {t.l3_2.thisBag}: <b className="num">{last > 0 ? "+" : ""}{last} {t.l3_2.grams}</b>
            </span>
          ) : null}
        </div>
      </Card>

      <button className="btn-primary !py-8 text-2xl" onClick={() => api.submit("stop")}>
        {t.l3_2.stop}
      </button>

      <ProgressBar value={s.index} max={s.bags} />
    </div>
  );
}

/* ------------------------------------------------------------------ 3.3 */

export function FreeKilosView({ api }: { api: LevelApi<FreeKilosState> }) {
  const { t } = useT();
  const s = api.state;
  const settings = [25.0, 25.2, 25.4];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l3_3.prompt}</div>
        <div className="num mt-1 text-sm text-slate-600">
          {t.l3_3.bagsFilled}: <b>{s.bagsPerTruck}</b>
        </div>
      </Card>

      <div className="grid gap-3">
        {settings.map((kg) => (
          <button
            key={kg}
            className="btn-choice flex items-center justify-between"
            disabled={s.done >= s.rounds}
            onClick={() => api.submit("run", { setting: kg })}
          >
            <span className="num text-xl font-extrabold">{kg.toFixed(1)} kg</span>
            <span className="text-sm text-slate-500">{t.l3_3.run}</span>
          </button>
        ))}
      </div>

      {s.totalGivenKg > 0 ? (
        <Card className="bg-ofm-red/5 ring-ofm-red/30">
          <div className="text-sm text-slate-700">{t.l3_3.reveal}</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-slate-500">{t.l3_3.perTruck}</span>
            <span className="num text-2xl font-extrabold text-ofm-red">
              {Math.round(s.totalGivenKg)} kg
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="flex items-center gap-1 text-sm text-slate-500">
              {t.l3_3.perYear} <TodoConfirm />
            </span>
            <span className="num font-bold text-ofm-red">~18,000 OMR</span>
          </div>
        </Card>
      ) : null}

      <ProgressBar value={s.done} max={s.rounds} />
    </div>
  );
}

/* ------------------------------------------------------------------ 6.1 */

export function BaggedOrBulkView({ api }: { api: LevelApi<FormForkState> }) {
  const { t } = useT();
  const s = api.state;
  const round = s.rounds[s.index];
  if (!round) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l6_1.prompt}</div>
        <div className="mt-1 text-2xl font-extrabold text-sls-ink">
          {round.form === "bag" ? t.l6_1.bagged : t.l6_1.bulk}
        </div>
        <div className="num mt-1 text-sm text-slate-500">{round.code}</div>
      </Card>

      <div className="text-sm text-slate-600">{t.l6_1.pickTruck}</div>
      <div className="grid gap-3">
        <button className="btn-choice" onClick={() => api.submit("book", { truckType: "flatbed" })}>
          {t.l6_1.flatbed}
        </button>
        <button className="btn-choice" onClick={() => api.submit("book", { truckType: "tipper" })}>
          {t.l6_1.tipper}
        </button>
      </div>

      <ProgressBar value={s.index} max={s.rounds.length} />
      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 6.3 */

export function ContractBoardView({ api }: { api: LevelApi<ContractBoardState> }) {
  const { t } = useT();
  const s = api.state;
  const round = s.rounds[s.index];
  if (!round) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l6_3.prompt}</div>
        <div className="mt-1 text-xl font-extrabold text-sls-ink">{round.customerName}</div>
        <div className="text-sm text-slate-500">
          {round.destination} · {round.form === "bag" ? t.l6_1.bagged : t.l6_1.bulk}
        </div>
      </Card>

      <div className="grid gap-2">
        {transporters.map((tr) => (
          <button
            key={tr.id}
            className="btn-choice flex items-center justify-between"
            onClick={() => api.submit("assign", { transporterId: tr.id })}
          >
            <span>{tr.name}</span>
            <span className="text-xs text-slate-400">{tr.contactRole}</span>
          </button>
        ))}
      </div>

      <ProgressBar value={s.index} max={s.rounds.length} />
      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 6.4 */

export function SoharPoultryView({ api }: { api: LevelApi<SoharTrapState> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l6_4.cargo}</div>
        <div className="mt-1 text-xl font-extrabold text-sls-ink">{t.l6_4.premixBags}</div>
        <p className="mt-2 text-sm text-slate-500">{t.l6_4.trap}</p>
      </Card>

      {s.chosen === null ? (
        <div className="grid gap-3">
          {s.options.map((o) => (
            <button
              key={o.transporterId}
              className="btn-choice flex items-center justify-between"
              onClick={() => api.submit("choose", { transporterId: o.transporterId })}
            >
              <span>
                <span className="font-bold">{o.name}</span>
                <span className="ms-2 text-sm text-slate-500">
                  {o.truckType === "flatbed" ? t.l6_1.flatbed : t.l6_1.tipper}
                </span>
              </span>
              <span className="num font-bold text-sls-ink">
                {o.rateOmr ?? "—"} {t.hud.omr}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="text-sm font-semibold text-slate-700">{t.l6_4.objective}</div>
          <button className="btn-choice" onClick={() => api.submit("reason", { why: "cargoForm" })}>
            {t.l6_1.prompt} — {t.l6_1.bagged}
          </button>
          <button className="btn-choice" onClick={() => api.submit("reason", { why: "price" })}>
            {t.l6_3.rate}
          </button>
          <button className="btn-choice" onClick={() => api.submit("reason", { why: "habit" })}>
            {t.l6_3.escalate}
          </button>
        </div>
      )}

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 6.6 */

export function NoContractView({ api }: { api: LevelApi<NoContractStateLocal> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l6_6.prompt}</div>
        <div className="mt-1 text-xl font-extrabold text-sls-ink">{s.route}</div>
      </Card>

      <div className="grid gap-3">
        <button className="btn-choice" onClick={() => api.submit("decide", { action: "improvise" })}>
          {t.l6_6.improvise}
        </button>
        <button className="btn-choice" onClick={() => api.submit("decide", { action: "escalate" })}>
          {t.l6_6.escalateNow}
        </button>
      </div>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}
interface NoContractStateLocal {
  route: string;
  decided: string | null;
}

/* ------------------------------------------------------------------ 6.7 */

export function FerryView({ api }: { api: LevelApi<FerryState> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.l6_7.driveTime}</dt>
          <dd className="num text-end font-semibold">{s.driveH} h</dd>
          <dt className="text-slate-500">{t.l6_7.arriveBy}</dt>
          <dd className="num text-end font-semibold">{s.dueInH} h</dd>
        </dl>
      </Card>

      <div className="text-sm text-slate-600">{t.l6_7.prompt}</div>
      <div className="grid gap-3">
        {s.departures.map((h) => (
          <button
            key={h}
            className="btn-choice flex items-center justify-between"
            onClick={() => api.submit("book", { departH: h })}
          >
            <span>{t.l6_7.ferryAt}</span>
            <span className="num font-bold">+{h} h</span>
          </button>
        ))}
      </div>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 8.2 */

export function LabourForecastView({ api }: { api: LevelApi<LabourState> }) {
  const { t } = useT();
  const s = api.state;
  const [belts, setBelts] = useState(1);
  const [bays, setBays] = useState(1);
  const [crew, setCrew] = useState(10);

  const Slider = ({
    label,
    value,
    set,
    min,
    max,
  }: {
    label: string;
    value: number;
    set: (n: number) => void;
    min: number;
    max: number;
  }) => (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="num text-lg font-extrabold text-sls-ink">{value}</span>
      </div>
      <input
        className="tap w-full"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">
          {t.l8_2.ordersToday}
        </div>
        <div className="num mt-1 text-2xl font-extrabold text-sls-ink">
          {s.totalMt} MT
        </div>
        <div className="num mt-1 text-xs text-slate-500">
          {s.ordersMt.join(" · ")}
        </div>
      </Card>

      <Card className="grid gap-3">
        <Slider label={t.l8_2.belts} value={belts} set={setBelts} min={1} max={13} />
        <Slider label={t.l8_2.bays} value={bays} set={setBays} min={1} max={6} />
        <Slider label={t.l8_2.crew} value={crew} set={setCrew} min={4} max={40} />
      </Card>

      {/* the SLS output format, live */}
      <Card className="bg-sls-ink text-white">
        <div className="text-xs uppercase tracking-widest text-white/60">{t.l8_2.target}</div>
        <div className="num mt-1 font-bold">
          {belts} {t.l8_2.belts} + {bays} {t.l8_2.bays} → {crew} · {t.l8_2.day}{" "}
          {Math.ceil(crew * 0.6)} / {t.l8_2.night} {crew - Math.ceil(crew * 0.6)}
        </div>
      </Card>

      <button
        className="btn-primary"
        onClick={() => api.submit("commit", { belts, bays, crew })}
      >
        {t.l8_2.commit}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ 8.5 */

export function LeaveChainView({ api }: { api: LevelApi<LeaveChainState> }) {
  const { t } = useT();
  const s = api.state;
  const absent = s.people.find((p) => p.id === s.absentId)!;
  const cover = s.people.find((p) => p.id === s.coverId);

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-ofm-orange/5 ring-ofm-orange/30">
        <div className="text-xs uppercase tracking-widest text-ofm-orange">{t.l8_5.onLeave}</div>
        <div className="mt-1 font-bold text-sls-ink">{absent.roleLabel}</div>
        <div className="text-sm text-slate-500">
          {absent.team === "A" ? t.l8_5.teamA : t.l8_5.teamB} ·{" "}
          {absent.shift === "day" ? t.l8_2.day : t.l8_2.night}
        </div>
      </Card>

      <div className="text-sm text-slate-600">{t.l8_5.pickCover}</div>
      <div className="grid gap-2">
        {s.people
          .filter((p) => p.id !== s.absentId)
          .map((p) => (
            <button
              key={p.id}
              className={`btn-choice flex items-center justify-between ${
                s.coverId === p.id ? "btn-choice-good" : ""
              }`}
              onClick={() => api.submit("pick", { id: p.id })}
            >
              <span className="font-semibold">{p.roleLabel}</span>
              <span className="text-xs text-slate-500">
                {p.team === "A" ? t.l8_5.teamA : t.l8_5.teamB} ·{" "}
                {p.shift === "day" ? t.l8_2.day : t.l8_2.night}
              </span>
            </button>
          ))}
      </div>

      {cover ? (
        <Card>
          <div className="text-xs uppercase tracking-widest text-slate-500">
            {t.l8_5.chainPreview}
          </div>
          <div className="mt-1 text-sm">
            {cover.roleLabel} → {absent.roleLabel}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {t.l8_5.coverage}:{" "}
            {cover.shift === absent.shift ? (
              <span className="font-bold text-ofm-green">100%</span>
            ) : (
              <span className="font-bold text-ofm-red">{t.l8_5.gap}</span>
            )}
          </div>
        </Card>
      ) : null}

      <button className="btn-primary" disabled={!cover} onClick={() => api.submit("confirm")}>
        {t.l8_5.confirm}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ 8.6 */

export function GhostHourView({ api }: { api: LevelApi<GhostHourState> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            {t.l8_6.rollover}
          </span>
          <span className="num text-xl font-extrabold text-sls-ink">
            {String(s.rolloverHour).padStart(2, "0")}:00
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <TodoConfirm title={t.confirm.millTz} />
          <span className="text-xs text-slate-500">{t.hud.millDay}</span>
        </div>
      </Card>

      <div className="text-sm text-slate-600">{t.l8_6.postAt}</div>
      <div className="grid gap-3">
        {s.choices.map((h) => {
          const previous = h < s.rolloverHour;
          return (
            <button
              key={h}
              className="btn-choice flex items-center justify-between"
              onClick={() => api.submit("post", { hour: h })}
            >
              <span className="num text-lg font-bold">
                {String(h).padStart(2, "0")}:30
              </span>
              <span className="text-xs text-slate-400">
                {t.l8_6.willFileOn} {previous ? t.l8_6.yesterday : t.l8_6.today}
              </span>
            </button>
          );
        })}
      </div>

      {s.posted !== null && s.filedOnPreviousDay ? (
        <div className="rounded-xl bg-ofm-red/5 p-4 text-sm text-slate-700 ring-1 ring-ofm-red/30">
          {t.hud.ghostHour}
        </div>
      ) : null}
    </div>
  );
}
