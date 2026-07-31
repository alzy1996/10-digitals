/**
 * Chapters 2, 4, 5, 7 and the Chapter 9 exam, plus 6.5.
 *
 * With these the campaign covers every persona in PRD 2.1 and every learning
 * objective in PRD 3 that does not require a 3D zone.
 */

import type { Command, LevelDefinition, ScoreParts, SimContext } from "../sim/engine";
import type { Rng } from "../sim/rng";
import { BAGS_PER_MT, mtToBags } from "../sim/entities";
import { coreCodes, customers, rules } from "../content";

const MIN = 60_000;

function parts(accuracy: number, elapsedMs: number, parMs: number, lost: number, cap: number): ScoreParts {
  const speed = elapsedMs <= parMs ? 1 : Math.max(0, 1 - (elapsedMs - parMs) / (parMs * 2));
  return {
    accuracy: Math.max(0, Math.min(1, accuracy)),
    speed,
    cost: Math.max(0, 1 - lost / cap),
    safety: 1,
  };
}

/* ================================================================= 2.1
   Raw Material Check.

   The confirmed categories from the real production check. The full RM
   master is still outstanding, so the level uses only what is confirmed
   and says so. */

export const RM_CONFIRMED = ["Vitamin B6", "Vitamin E", "Probiotics", "Premix"];

export interface RawMaterialState {
  lines: { name: string; required: number; available: number }[];
  answered: boolean;
  correct: boolean;
}

export const L2_1_RawMaterial: LevelDefinition<RawMaterialState> = {
  id: "2.1",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): RawMaterialState {
    // roughly half the time something is genuinely short
    const short = rng.next() < 0.5;
    const shortIndex = rng.int(0, RM_CONFIRMED.length - 1);
    const lines = RM_CONFIRMED.map((name, i) => {
      const required = rng.int(20, 120);
      const available =
        short && i === shortIndex ? required - rng.int(5, 15) : required + rng.int(0, 60);
      return { name, required, available };
    });
    return { lines, answered: false, correct: false };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "answer") return null;
    const saidReady = Boolean(cmd.payload?.ready);
    const actuallyReady = state.lines.every((l) => l.available >= l.required);

    state.answered = true;
    state.correct = saidReady === actuallyReady;

    // Promising a date the mill cannot hit cascades through the whole shift,
    // so declaring ready when it is not is the expensive direction.
    if (saidReady && !actuallyReady) {
      ctx.charge({
        reason: "deadline_missed",
        omr: -180,
        messageKey: "l2_1.cannotRun",
      });
    } else if (!saidReady && actuallyReady) {
      ctx.charge({
        reason: "idle_labour",
        omr: -40,
        messageKey: "l2_1.canRun",
      });
    }
    ctx.emit("answered", { saidReady, actuallyReady });
    return null;
  },

  isComplete(state) {
    return state.answered;
  },

  score(state, ctx) {
    return parts(state.correct ? 1 : 0, ctx.tick * 50, 45_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 2.5
   Production to Delivery handshake.

   The trigger phrase is a core game beat and must appear verbatim
   (PRD 4.4, locked). A vague message is what makes the wrong truck turn up
   two chapters later. */

export const HANDSHAKE_FIELDS = ["product", "mt", "bags", "deadline", "customer"];
const HANDSHAKE_NOISE = ["driver mobile", "weather", "your lunch order"];

export interface HandshakeState {
  options: string[];
  included: string[];
  sent: boolean;
}

export const L2_5_Handshake: LevelDefinition<HandshakeState> = {
  id: "2.5",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): HandshakeState {
    return {
      options: rng.shuffle([...HANDSHAKE_FIELDS, ...HANDSHAKE_NOISE]),
      included: [],
      sent: false,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type === "toggle") {
      const field = String(cmd.payload?.field ?? "");
      state.included = state.included.includes(field)
        ? state.included.filter((f) => f !== field)
        : [...state.included, field];
      return null;
    }

    if (cmd.type === "send") {
      state.sent = true;
      const missing = HANDSHAKE_FIELDS.filter((f) => !state.included.includes(f));
      if (missing.length > 0) {
        ctx.charge({
          reason: "wrong_truck_type",
          omr: -40 * missing.length,
          messageKey: "l2_5.missing",
          params: { missing: missing.join(", ") },
        });
      }
      ctx.emit("sent", { missing: missing.length });
      return null;
    }
    return null;
  },

  isComplete(state) {
    return state.sent;
  },

  score(state, ctx) {
    const hits = HANDSHAKE_FIELDS.filter((f) => state.included.includes(f)).length;
    const noise = state.included.filter((f) => !HANDSHAKE_FIELDS.includes(f)).length;
    const accuracy = Math.max(0, (hits - noise) / HANDSHAKE_FIELDS.length);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 4.2
   FIFO.

   The oldest batch is deliberately the furthest one. Picking by proximity
   is the tempting wrong answer, exactly as in the real racking. */

export interface FifoState {
  batches: { id: string; code: string; ageDays: number; distance: number }[];
  picked: string | null;
  oldestId: string;
}

export const L4_2_Fifo: LevelDefinition<FifoState> = {
  id: "4.2",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): FifoState {
    const code = rng.pick(coreCodes);
    const ages = rng.shuffle([3, 11, 26, 41]);
    const batches = ages.map((ageDays, i) => ({
      id: `B${i + 1}`,
      code,
      ageDays,
      // distance runs inversely to age: the oldest sits deepest
      distance: 0,
    }));
    const sortedByAge = [...batches].sort((a, b) => b.ageDays - a.ageDays);
    sortedByAge.forEach((b, i) => {
      b.distance = (sortedByAge.length - i) * 4; // oldest = furthest
    });
    return {
      batches,
      picked: null,
      oldestId: sortedByAge[0].id,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "pick") return null;
    const id = String(cmd.payload?.id ?? "");
    state.picked = id;

    if (id !== state.oldestId) {
      const oldest = state.batches.find((b) => b.id === state.oldestId)!;
      ctx.charge({
        reason: "fifo_breach",
        omr: -60,
        messageKey: "reason.fifo_breach",
        params: { age: oldest.ageDays },
      });
    }
    ctx.emit("picked", { id, ok: id === state.oldestId });
    return null;
  },

  isComplete(state) {
    return state.picked !== null;
  },

  score(state, ctx) {
    return parts(
      state.picked === state.oldestId ? 1 : 0,
      ctx.tick * 50,
      30_000,
      ctx.ledger.lost(),
      120,
    );
  },
};

/* ================================================================= 5.5
   Gross and Net.

   net = gross - tare, compared against the SO. Out of tolerance the
   correct action is to STOP, not to wave it through.

   The real accepted variance is TODO_CONFIRM (PRD 14 Q6); 2% is used here
   and labelled. */

export const NET_TOLERANCE = 0.02;

export interface WeighbridgeState {
  tareKg: number;
  grossKg: number;
  soMt: number;
  enteredNet: number | null;
  decided: "dispatch" | "stop" | null;
  /** Whether the load really is inside tolerance. */
  withinTolerance: boolean;
}

export const L5_5_GrossNet: LevelDefinition<WeighbridgeState> = {
  id: "5.5",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): WeighbridgeState {
    const soMt = rng.pick([12.5, 17.5, 25, 30, 35]);
    const tareKg = rng.int(12_000, 16_000);
    // half the time the load is genuinely out of tolerance
    const bad = rng.next() < 0.5;
    const driftPct = bad ? rng.float(0.03, 0.08) * (rng.next() < 0.5 ? -1 : 1) : rng.float(-0.015, 0.015);
    const netKg = Math.round(soMt * 1000 * (1 + driftPct));
    return {
      tareKg,
      grossKg: tareKg + netKg,
      soMt,
      enteredNet: null,
      decided: null,
      withinTolerance: Math.abs(netKg - soMt * 1000) <= soMt * 1000 * NET_TOLERANCE,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type === "net") {
      const entered = Number(cmd.payload?.value);
      state.enteredNet = entered;
      const actual = state.grossKg - state.tareKg;
      if (entered !== actual) {
        ctx.charge({
          reason: "wrong_product",
          omr: -60,
          messageKey: "l5_5.computeNet",
          params: { entered, actual },
        });
      }
      ctx.emit("netEntered", { ok: entered === actual });
      return null;
    }

    if (cmd.type === "decide") {
      const decided = String(cmd.payload?.action) as "dispatch" | "stop";
      state.decided = decided;
      const shouldDispatch = state.withinTolerance;
      if (decided === "dispatch" && !shouldDispatch) {
        // a short or over load reaching the customer is the expensive failure
        ctx.charge({
          reason: "wrong_product",
          omr: -250,
          messageKey: "l5_5.stop",
        });
      } else if (decided === "stop" && shouldDispatch) {
        ctx.charge({
          reason: "truck_waiting",
          omr: -40,
          messageKey: "l5_5.dispatch",
        });
      }
      ctx.emit("decided", { decided, shouldDispatch });
      return null;
    }
    return null;
  },

  isComplete(state) {
    return state.decided !== null;
  },

  score(state, ctx) {
    const actual = state.grossKg - state.tareKg;
    const netOk = state.enteredNet === actual ? 1 : 0;
    const callOk =
      state.decided === (state.withinTolerance ? "dispatch" : "stop") ? 1 : 0;
    return parts((netOk + callOk) / 2, ctx.tick * 50, 75_000, ctx.ledger.lost(), 400);
  },
};

/* ================================================================= 5.6
   The Paper Chain.

   Confirmed from the Smart Fleet approval design: Delivery, then Packing,
   then Production. Each role sees only its own queue and the order cannot
   be skipped. */

export const SIGN_ORDER = ["delivery", "packing", "production"] as const;
export type SignRole = (typeof SIGN_ORDER)[number];

export interface PaperChainState {
  signed: SignRole[];
  outOfOrderAttempts: number;
  remark: string | null;
}

export const L5_6_PaperChain: LevelDefinition<PaperChainState> = {
  id: "5.6",
  durationMs: 6 * MIN,
  rules: [],

  init(): PaperChainState {
    return { signed: [], outOfOrderAttempts: 0, remark: null };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type === "sign") {
      const role = String(cmd.payload?.role) as SignRole;
      const expected = SIGN_ORDER[state.signed.length];

      if (role !== expected) {
        state.outOfOrderAttempts += 1;
        ctx.charge({
          reason: "missing_document",
          omr: -50,
          messageKey: "l5_6.outOfOrder",
          params: { role, expected },
        });
        ctx.emit("outOfOrder", { role, expected });
        return null;
      }

      state.signed.push(role);
      // the Production Clerk adds a remark, which the final print carries
      if (role === "production") state.remark = "checked";
      ctx.emit("signed", { role });
      return null;
    }
    return null;
  },

  isComplete(state) {
    return state.signed.length === SIGN_ORDER.length;
  },

  score(state, ctx) {
    const accuracy = Math.max(0, 1 - state.outOfOrderAttempts * 0.34);
    return parts(accuracy, ctx.tick * 50, 45_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 6.5
   Not My Lane. Scope is bags and flat bed; a tipper route is refused. */

export interface ScopeState {
  decided: string | null;
}

export const L6_5_NotMyLane: LevelDefinition<ScopeState> = {
  id: "6.5",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(): ScopeState {
    return { decided: null };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "decide") return null;
    const action = String(cmd.payload?.action ?? "");
    state.decided = action;
    const withinScope = action === "refuse";
    if (withinScope) {
      ctx.charge({
        reason: "correct_call",
        omr: 40,
        messageKey: "l6_5.refuse",
      });
    }
    ctx.emit("decided", { action });
    return { bookedTruckType: "tipper", withinScope };
  },

  isComplete(state) {
    return state.decided !== null;
  },

  score(state, ctx) {
    return parts(state.decided === "refuse" ? 1 : 0, ctx.tick * 50, 30_000, ctx.ledger.lost(), 120);
  },
};

/* ================================================================= 7.2
   Inbound Weighbridge. Receiving reverses the arithmetic. */

export interface InboundState {
  loadedKg: number;
  emptyKg: number;
  entered: number | null;
}

export const L7_2_Inbound: LevelDefinition<InboundState> = {
  id: "7.2",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): InboundState {
    const emptyKg = rng.int(12_000, 16_000);
    const receivedKg = rng.int(20_000, 34_000);
    return { loadedKg: emptyKg + receivedKg, emptyKg, entered: null };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "enter") return null;
    const entered = Number(cmd.payload?.value);
    state.entered = entered;
    const actual = state.loadedKg - state.emptyKg;
    if (entered !== actual) {
      ctx.charge({
        reason: "wrong_product",
        omr: -80,
        messageKey: "l7_2.enterReceived",
        params: { entered, actual },
      });
    }
    ctx.emit("entered", { ok: entered === actual });
    return null;
  },

  isComplete(state) {
    return state.entered !== null;
  },

  score(state, ctx) {
    const actual = state.loadedKg - state.emptyKg;
    return parts(state.entered === actual ? 1 : 0, ctx.tick * 50, 45_000, ctx.ledger.lost(), 160);
  },
};

/* ================================================================= 9.1
   The Full Shift.

   Unscripted: a mixed stream of the decisions the campaign taught, with no
   hints and no explanation until the end. Passing this is certification. */

export type ExamKind = "form" | "fifo" | "scope" | "contract" | "ghost" | "net";

export interface ExamItem {
  kind: ExamKind;
  prompt: string;
  options: string[];
  correct: string;
}

export interface ExamState {
  items: ExamItem[];
  index: number;
  errors: number;
}

function buildExam(rng: Rng): ExamItem[] {
  const items: ExamItem[] = [];

  for (let i = 0; i < 8; i++) {
    const kind = rng.pick<ExamKind>(["form", "fifo", "scope", "contract", "ghost", "net"]);

    if (kind === "form") {
      const bagged = rng.next() < 0.5;
      items.push({
        kind,
        prompt: bagged ? "bagged" : "bulk",
        options: ["flatbed", "tipper"],
        correct: bagged ? "flatbed" : "tipper",
      });
    } else if (kind === "fifo") {
      const ages = rng.shuffle([4, 12, 30, 44]).slice(0, 3);
      items.push({
        kind,
        prompt: "fifo",
        options: ages.map(String),
        correct: String(Math.max(...ages)),
      });
    } else if (kind === "scope") {
      items.push({ kind, prompt: "tipper", options: ["book", "refuse"], correct: "refuse" });
    } else if (kind === "contract") {
      items.push({
        kind,
        prompt: "nocontract",
        options: ["improvise", "escalate"],
        correct: "escalate",
      });
    } else if (kind === "ghost") {
      items.push({ kind, prompt: "0130", options: ["post", "wait"], correct: "wait" });
    } else {
      const mt = rng.pick([12.5, 25, 35]);
      items.push({
        kind,
        prompt: String(mt),
        options: [String(mtToBags(mt)), String(mt * BAGS_PER_MT + 40), String(mt * 25)],
        correct: String(mtToBags(mt)),
      });
    }
  }
  return items;
}

export const L9_1_FullShift: LevelDefinition<ExamState> = {
  id: "9.1",
  durationMs: 12 * MIN,
  rules: rules.all,

  init(rng: Rng): ExamState {
    return { items: buildExam(rng), index: 0, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "answer") return null;
    const item = state.items[state.index];
    if (!item) return null;
    const given = String(cmd.payload?.value ?? "");
    const ok = given === item.correct;

    if (!ok) {
      state.errors += 1;
      // no explanation during the exam - the debrief comes at the end
      ctx.charge({
        reason: "wrong_product",
        omr: -120,
        messageKey: `l9_1.${item.kind}`,
        params: { given },
      });
    }
    state.index += 1;
    ctx.emit("answered", { kind: item.kind, ok });
    return null;
  },

  isComplete(state) {
    return state.index >= state.items.length;
  },

  score(state, ctx) {
    const total = state.items.length;
    return parts((total - state.errors) / total, ctx.tick * 50, 240_000, ctx.ledger.lost(), 960);
  },
};

/** Customers are used by the exam prompts in the view layer. */
export const EXAM_CUSTOMERS = customers;
