/**
 * Views for chapters 2, 4, 5, 7, 9 and level 6.5.
 */

import { useState } from "react";
import { Card, Consequence, ProgressBar, TodoConfirm, useT } from "../ui/bits";
import type { LevelApi } from "./LevelHost";
import type {
  ExamState,
  FifoState,
  HandshakeState,
  InboundState,
  PaperChainState,
  RawMaterialState,
  ScopeState,
  WeighbridgeState,
} from "./defs3";
import { HANDSHAKE_FIELDS, NET_TOLERANCE, SIGN_ORDER } from "./defs3";

function Violations({ api }: { api: LevelApi<unknown> }) {
  if (api.violations.length === 0) return null;
  const v = api.violations[0];
  return <Consequence messageEn={v.messageEn} messageAr={v.messageAr} omr={-v.costOMR} />;
}

/* ------------------------------------------------------------------ 2.1 */

export function RawMaterialView({ api }: { api: LevelApi<RawMaterialState> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-slate-500">{t.l2_1.stock}</span>
          <TodoConfirm title={t.l2_1.rmNote} />
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400">
              <th className="text-start font-medium">&nbsp;</th>
              <th className="text-end font-medium">{t.l2_1.required}</th>
              <th className="text-end font-medium">{t.l2_1.available}</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => {
              const short = l.available < l.required;
              return (
                <tr key={l.name} className={short ? "text-ofm-red" : ""}>
                  <td className="py-1 font-semibold">{l.name}</td>
                  <td className="num py-1 text-end">{l.required}</td>
                  <td className="num py-1 text-end font-bold">{l.available}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="text-sm text-slate-600">{t.l2_1.prompt}</div>
      <div className="grid gap-3">
        <button className="btn-choice" onClick={() => api.submit("answer", { ready: true })}>
          {t.l2_1.canRun}
        </button>
        <button className="btn-choice" onClick={() => api.submit("answer", { ready: false })}>
          {t.l2_1.cannotRun}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2.5 */

export function HandshakeView({ api }: { api: LevelApi<HandshakeState> }) {
  const { t } = useT();
  const s = api.state;

  return (
    <div className="flex flex-col gap-4">
      {/* the trigger phrase is a core beat and appears verbatim */}
      <Card className="bg-sls-ink text-white">
        <div className="text-xs uppercase tracking-widest text-white/60">{t.l2_5.prompt}</div>
        <div className="mt-1 font-bold">{t.l2_5.trigger}</div>
      </Card>

      <div className="grid gap-2">
        {s.options.map((f) => {
          const on = s.included.includes(f);
          return (
            <button
              key={f}
              className={`btn-choice flex items-center justify-between ${on ? "btn-choice-good" : ""}`}
              onClick={() => api.submit("toggle", { field: f })}
            >
              <span className="font-semibold">{f}</span>
              <span className="text-xs text-slate-500">{on ? t.l2_5.include : t.l2_5.omit}</span>
            </button>
          );
        })}
      </div>

      <button className="btn-primary" onClick={() => api.submit("send")}>
        {t.l2_5.send}
      </button>

      <ProgressBar value={s.included.filter((f) => HANDSHAKE_FIELDS.includes(f)).length} max={HANDSHAKE_FIELDS.length} />
    </div>
  );
}

/* ------------------------------------------------------------------ 4.2 */

export function FifoView({ api }: { api: LevelApi<FifoState> }) {
  const { t } = useT();
  const s = api.state;
  const nearest = [...s.batches].sort((a, b) => a.distance - b.distance)[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-slate-600">{t.l4_2.prompt}</div>
      <div className="grid gap-2">
        {[...s.batches]
          .sort((a, b) => a.distance - b.distance)
          .map((b) => (
            <button
              key={b.id}
              className="btn-choice flex items-center justify-between"
              disabled={s.picked !== null}
              onClick={() => api.submit("pick", { id: b.id })}
            >
              <span>
                <span className="num font-bold">{b.code}</span>
                <span className="ms-2 text-sm text-slate-500">
                  {b.ageDays} {t.l4_2.daysOld}
                </span>
              </span>
              {b.id === nearest.id ? (
                <span className="badge bg-slate-100 text-slate-500">{t.l4_2.nearest}</span>
              ) : null}
            </button>
          ))}
      </div>
      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 5.5 */

export function GrossNetView({ api }: { api: LevelApi<WeighbridgeState> }) {
  const { t } = useT();
  const s = api.state;
  const [net, setNet] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.l5_5.tare}</dt>
          <dd className="num text-end font-semibold">{s.tareKg} kg</dd>
          <dt className="text-slate-500">{t.l5_5.gross}</dt>
          <dd className="num text-end font-semibold">{s.grossKg} kg</dd>
          <dt className="text-slate-500">{t.l5_5.soQty}</dt>
          <dd className="num text-end font-semibold">{s.soMt} MT</dd>
        </dl>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          {t.l5_5.tolerance}: ±{Math.round(NET_TOLERANCE * 100)}%
          <TodoConfirm title={t.l5_5.toleranceNote} />
        </div>
      </Card>

      {s.enteredNet === null ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (net.trim() !== "") api.submit("net", { value: Number(net) });
          }}
        >
          <input
            className="num tap w-full rounded-xl px-4 py-3 text-xl font-bold ring-1 ring-slate-900/10"
            inputMode="numeric"
            placeholder={t.l5_5.computeNet}
            value={net}
            onChange={(e) => setNet(e.target.value)}
            aria-label={t.l5_5.net}
          />
          <button className="btn-primary" type="submit">
            {t.nav.next}
          </button>
        </form>
      ) : (
        <div className="grid gap-3">
          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-500">{t.l5_5.net}</span>
              <span className="num text-2xl font-extrabold text-sls-ink">{s.enteredNet} kg</span>
            </div>
          </Card>
          <button className="btn-choice" onClick={() => api.submit("decide", { action: "dispatch" })}>
            {t.l5_5.dispatch}
          </button>
          <button className="btn-choice" onClick={() => api.submit("decide", { action: "stop" })}>
            {t.l5_5.stop}
          </button>
        </div>
      )}

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 5.6 */

export function PaperChainView({ api }: { api: LevelApi<PaperChainState> }) {
  const { t } = useT();
  const s = api.state;
  const label: Record<string, string> = {
    delivery: t.l5_6.delivery,
    packing: t.l5_6.packing,
    production: t.l5_6.production,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* the chain, drawn in order so the sequence is visible */}
      <div className="grid gap-2">
        {SIGN_ORDER.map((role, i) => {
          const done = s.signed.includes(role);
          const next = s.signed.length === i;
          return (
            <Card
              key={role}
              className={`flex items-center justify-between ${done ? "bg-ofm-green/5 ring-ofm-green/30" : ""}`}
            >
              <span className="flex items-center gap-2">
                <span className="num text-slate-400">{i + 1}</span>
                <span className="font-semibold">{label[role]}</span>
              </span>
              {done ? (
                <span className="badge bg-ofm-green/15 text-ofm-green">{t.l5_6.signed}</span>
              ) : (
                <button
                  className={`btn ${next ? "btn-primary" : "btn-ghost"} !px-4 !py-2`}
                  onClick={() => api.submit("sign", { role })}
                >
                  {t.l5_6.sign}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {s.remark ? (
        <div className="rounded-xl bg-ofm-green/10 p-3 text-sm text-ofm-green ring-1 ring-ofm-green/30">
          {t.l5_6.complete} · {t.l5_6.remark}
        </div>
      ) : null}

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 6.5 */

export function NotMyLaneView({ api }: { api: LevelApi<ScopeState> }) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l6_5.prompt}</div>
        <div className="mt-1 text-xl font-extrabold text-sls-ink">{t.l6_1.tipper}</div>
      </Card>
      <div className="grid gap-3">
        <button className="btn-choice" onClick={() => api.submit("decide", { action: "book" })}>
          {t.l6_5.book}
        </button>
        <button className="btn-choice" onClick={() => api.submit("decide", { action: "refuse" })}>
          {t.l6_5.refuse}
        </button>
      </div>
      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 7.2 */

export function InboundView({ api }: { api: LevelApi<InboundState> }) {
  const { t } = useT();
  const s = api.state;
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs uppercase tracking-widest text-slate-500">{t.l7_2.item}</div>
        <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.l7_2.firstWeigh}</dt>
          <dd className="num text-end font-semibold">{s.loadedKg} kg</dd>
          <dt className="text-slate-500">{t.l7_2.secondWeigh}</dt>
          <dd className="num text-end font-semibold">{s.emptyKg} kg</dd>
        </dl>
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() !== "") api.submit("enter", { value: Number(value) });
        }}
      >
        <input
          className="num tap w-full rounded-xl px-4 py-3 text-xl font-bold ring-1 ring-slate-900/10"
          inputMode="numeric"
          placeholder={t.l7_2.enterReceived}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t.l7_2.received}
        />
        <button className="btn-primary" type="submit">
          {t.nav.next}
        </button>
      </form>

      <Violations api={api as LevelApi<unknown>} />
    </div>
  );
}

/* ------------------------------------------------------------------ 9.1 */

export function FullShiftView({ api }: { api: LevelApi<ExamState> }) {
  const { t } = useT();
  const s = api.state;
  const item = s.items[s.index];
  if (!item) return null;

  // The exam gives no hints, so prompts are terse by design.
  const promptFor: Record<string, string> = {
    form: item.prompt === "bagged" ? t.l6_1.bagged : t.l6_1.bulk,
    fifo: t.l4_2.prompt,
    scope: t.l6_5.prompt,
    contract: t.l6_6.prompt,
    ghost: t.l8_6.postAt + " 01:30",
    net: t.l1_3.promptToBags.replace("{mt}", item.prompt),
  };

  const optionLabel = (o: string) => {
    if (item.kind === "form") return o === "flatbed" ? t.l6_1.flatbed : t.l6_1.tipper;
    if (item.kind === "scope") return o === "book" ? t.l6_5.book : t.l6_5.refuse;
    if (item.kind === "contract") return o === "improvise" ? t.l6_6.improvise : t.l6_6.escalateNow;
    if (item.kind === "ghost") return o === "post" ? t.l8_6.post : t.l8_6.waitUntil;
    if (item.kind === "fifo") return `${o} ${t.l4_2.daysOld}`;
    return o;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-500">
        <span>{t.l9_1.incoming}</span>
        <span className="num">
          {t.l9_1.remaining} {s.items.length - s.index}
        </span>
      </div>

      <Card>
        <div className="text-xl font-extrabold text-sls-ink">{promptFor[item.kind]}</div>
      </Card>

      <ProgressBar value={s.index} max={s.items.length} />

      <div className="grid gap-3">
        {item.options.map((o) => (
          <button
            key={o}
            className="btn-choice"
            onClick={() => api.submit("answer", { value: o })}
          >
            {optionLabel(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
