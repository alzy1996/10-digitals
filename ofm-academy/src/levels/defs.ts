/**
 * Level definitions. Pure - no React, no DOM. Views submit commands and read
 * state; they never write it (PRD 6.1 rule 3).
 *
 * Each level's failure states cost OMR rather than saying "wrong"
 * (PRD 5.1 pillar 2).
 */

import type { Command, LevelDefinition, ScoreParts, SimContext } from "../sim/engine";
import type { Rng } from "../sim/rng";
import { BAGS_PER_MT, mtToBags } from "../sim/entities";
import { coreCodes, customers, glossary, rules } from "../content";
import * as D2 from "./defs2";

const MIN = 60_000;

/** Speed credit: full marks at or under par, tapering to zero at 3x par. */
function speedScore(elapsedMs: number, parMs: number): number {
  if (elapsedMs <= parMs) return 1;
  const over = (elapsedMs - parMs) / (parMs * 2);
  return Math.max(0, 1 - over);
}

/** Cost credit: full marks at zero loss, zero once loss reaches the cap. */
function costScore(lostOmr: number, capOmr: number): number {
  return Math.max(0, 1 - lostOmr / capOmr);
}

function parts(accuracy: number, elapsedMs: number, parMs: number, lost: number, cap: number): ScoreParts {
  return {
    accuracy: Math.max(0, Math.min(1, accuracy)),
    speed: speedScore(elapsedMs, parMs),
    cost: costScore(lost, cap),
    // Paper levels have no physical hazard, so safety is clean by construction.
    safety: 1,
  };
}

/* ------------------------------------------------------------------ 0.2 */

export interface GlossaryState {
  pairs: { id: string; en: string; ar: string }[];
  /** Arabic options in a shuffled order, so position teaches nothing. */
  choices: string[];
  index: number;
  matched: string[];
  errors: number;
}

export const L0_2_Glossary: LevelDefinition<GlossaryState> = {
  id: "0.2",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): GlossaryState {
    const pairs = rng.sample(glossary, 8).map((t) => ({ id: t.id, en: t.en, ar: t.ar }));
    return {
      pairs,
      choices: rng.shuffle(pairs.map((p) => p.ar)),
      index: 0,
      matched: [],
      errors: 0,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "match") return null;
    const chosen = String(cmd.payload?.ar ?? "");
    const target = state.pairs[state.index];
    if (!target) return null;

    if (chosen === target.ar) {
      state.matched.push(target.id);
      state.index += 1;
      ctx.emit("matched", { id: target.id });
    } else {
      state.errors += 1;
      ctx.emit("mismatch", { id: target.id });
    }
    return null;
  },

  isComplete(state) {
    return state.index >= state.pairs.length;
  },

  score(state, ctx) {
    const total = state.pairs.length;
    const accuracy = total === 0 ? 0 : Math.max(0, (total - state.errors) / total);
    return parts(accuracy, ctx.tick * 50, 90_000, 0, 100);
  },
};

/* ------------------------------------------------------------------ 1.1 */

export type SoField = "customer" | "product" | "mt" | "bags" | "deadline";
export const SO_FIELDS: SoField[] = ["customer", "product", "mt", "bags", "deadline"];

export interface ReadSoState {
  /** The order as printed on the document. */
  doc: { customer: string; product: string; mt: number; bags: number; deadline: string };
  /** Values the learner can choose from - correct ones plus near misses. */
  options: { field: SoField; value: string }[];
  filled: Partial<Record<SoField, string>>;
  errors: number;
}

function deadlineLabel(rng: Rng): string {
  const hour = rng.pick([6, 8, 10, 12, 14, 16, 18]);
  return `${String(hour).padStart(2, "0")}:00`;
}

export const L1_1_ReadSo: LevelDefinition<ReadSoState> = {
  id: "1.1",
  durationMs: 6 * MIN,
  rules: rules.order,

  init(rng: Rng): ReadSoState {
    const customer = rng.pick(customers);
    const code = rng.pick(coreCodes);
    const mt = rng.pick([12.5, 17.5, 25, 30, 35]);
    const bags = mtToBags(mt);
    const deadline = deadlineLabel(rng);

    const doc = { customer: customer.nameEn, product: code, mt, bags, deadline };

    // Distractors are the mistakes people actually make: a neighbouring code,
    // tonnes read as bags, the wrong customer on the same route.
    const otherCode = rng.pick(coreCodes.filter((c) => c !== code));
    const otherCustomer = rng.pick(customers.filter((c) => c.nameEn !== customer.nameEn));

    const options: { field: SoField; value: string }[] = rng.shuffle([
      { field: "customer", value: customer.nameEn },
      { field: "customer", value: otherCustomer.nameEn },
      { field: "product", value: code },
      { field: "product", value: otherCode },
      { field: "mt", value: String(mt) },
      { field: "mt", value: String(bags) },
      { field: "bags", value: String(bags) },
      { field: "bags", value: String(mt) },
      { field: "deadline", value: deadline },
      { field: "deadline", value: deadlineLabel(rng) },
    ]);

    return { doc, options, filled: {}, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "assign") return null;
    const field = cmd.payload?.field as SoField | undefined;
    const value = String(cmd.payload?.value ?? "");
    if (!field) return null;

    const expected: Record<SoField, string> = {
      customer: state.doc.customer,
      product: state.doc.product,
      mt: String(state.doc.mt),
      bags: String(state.doc.bags),
      deadline: state.doc.deadline,
    };

    state.filled[field] = value;
    const ok = value === expected[field];
    if (!ok) {
      state.errors += 1;
      ctx.charge({
        reason: "wrong_product",
        omr: -50,
        messageKey: "rule.R-PRODUCT-01",
        params: { field },
      });
    }
    ctx.emit("assigned", { field, ok });

    // hand the rules engine the facts it needs for this stage
    return {
      stage: "convert",
      bagsMatchMt:
        state.filled.mt !== undefined && state.filled.bags !== undefined
          ? Number(state.filled.bags) === Number(state.filled.mt) * BAGS_PER_MT
          : true,
    };
  },

  isComplete(state) {
    return SO_FIELDS.every((f) => state.filled[f] !== undefined);
  },

  score(state, ctx) {
    const accuracy = Math.max(0, (SO_FIELDS.length - state.errors) / SO_FIELDS.length);
    return parts(accuracy, ctx.tick * 50, 40_000, ctx.ledger.lost(), 250);
  },
};

/* ------------------------------------------------------------------ 1.2 */

export interface CodeBreakerState {
  rounds: { asked: string; choices: string[] }[];
  index: number;
  errors: number;
}

export const L1_2_CodeBreaker: LevelDefinition<CodeBreakerState> = {
  id: "1.2",
  durationMs: 6 * MIN,
  rules: rules.order,

  init(rng: Rng): CodeBreakerState {
    const rounds = rng.sample(coreCodes, 8).map((asked) => {
      // Near misses first: codes sharing two digits are the real-world trap.
      const near = coreCodes.filter(
        (c) => c !== asked && c[0] === asked[0] && c[1] === asked[1],
      );
      const far = coreCodes.filter((c) => c !== asked && !near.includes(c));
      const distractors = [...rng.sample(near, 2), ...rng.sample(far, 3)].slice(0, 3);
      return { asked, choices: rng.shuffle([asked, ...distractors]) };
    });
    return { rounds, index: 0, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "choose") return null;
    const round = state.rounds[state.index];
    if (!round) return null;
    const picked = String(cmd.payload?.code ?? "");
    const ok = picked === round.asked;

    if (!ok) {
      state.errors += 1;
      ctx.charge({
        reason: "wrong_product",
        omr: -250,
        messageKey: "rule.R-PRODUCT-01",
        params: { picked, asked: round.asked },
      });
    }
    state.index += 1;
    ctx.emit("answered", { ok, picked, asked: round.asked });
    return { stage: "load", loadedCodeMatchesSo: ok };
  },

  isComplete(state) {
    return state.index >= state.rounds.length;
  },

  score(state, ctx) {
    const total = state.rounds.length;
    const accuracy = total === 0 ? 0 : Math.max(0, (total - state.errors) / total);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), 1000);
  },
};

/* ------------------------------------------------------------------ 1.3 */

export interface MtBagsState {
  questions: { mt: number; toBags: boolean }[];
  index: number;
  correct: number;
  errors: number;
  streak: number;
  bestStreak: number;
}

export const L1_3_MtToBags: LevelDefinition<MtBagsState> = {
  id: "1.3",
  durationMs: 6 * MIN,
  rules: rules.order,

  init(rng: Rng): MtBagsState {
    const questions = Array.from({ length: 12 }, () => ({
      mt: rng.pick([2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35]),
      toBags: rng.next() < 0.6,
    }));
    return { questions, index: 0, correct: 0, errors: 0, streak: 0, bestStreak: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "answer") return null;
    const q = state.questions[state.index];
    if (!q) return null;

    const given = Number(cmd.payload?.value);
    const expected = q.toBags ? mtToBags(q.mt) : q.mt;
    const ok = Math.abs(given - expected) < 1e-6;

    if (ok) {
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.errors += 1;
      state.streak = 0;
      ctx.charge({ reason: "wrong_product", omr: -40, messageKey: "rule.R-QTY-01" });
    }
    state.index += 1;
    ctx.emit("answered", { ok, expected, given });
    return { stage: "convert", bagsMatchMt: ok };
  },

  isComplete(state) {
    return state.index >= state.questions.length;
  },

  score(state, ctx) {
    const total = state.questions.length;
    const accuracy = total === 0 ? 0 : state.correct / total;
    return parts(accuracy, ctx.tick * 50, 45_000, ctx.ledger.lost(), 480);
  },
};

/* ------------------------------------------------------------------ 1.4 */

export interface DeadlineOrder {
  id: string;
  customer: string;
  code: string;
  mt: number;
  /** Hours until the customer's deadline. */
  dueInH: number;
  /** Hours of transit, ferry included. Transit is not distance. */
  transitH: number;
  /** Hours until production can release it. */
  readyInH: number;
  requiresFerry: boolean;
}

export interface DeadlineState {
  orders: DeadlineOrder[];
  committed: string[] | null;
  correctOrder: string[];
}

/** Slack = how long you can wait before it is already too late. */
function slack(o: DeadlineOrder): number {
  return o.dueInH - o.transitH - o.readyInH;
}

export const L1_4_Deadline: LevelDefinition<DeadlineState> = {
  id: "1.4",
  durationMs: 6 * MIN,
  rules: rules.order,

  init(rng: Rng): DeadlineState {
    const picked = rng.sample(customers, 4);
    const orders: DeadlineOrder[] = picked.map((c, i) => {
      const ferry = c.requiresFerry;
      return {
        id: `SO-${rng.int(1000, 9999)}-${i}`,
        customer: c.nameEn,
        code: rng.pick(coreCodes),
        mt: rng.pick([12.5, 17.5, 25, 35]),
        dueInH: rng.int(10, 40),
        // the ferry leg is what makes transit stop tracking distance
        transitH: ferry ? rng.int(14, 20) : rng.int(2, 9),
        readyInH: rng.int(0, 6),
        requiresFerry: ferry,
      };
    });

    const correctOrder = orders
      .slice()
      .sort((a, b) => slack(a) - slack(b))
      .map((o) => o.id);

    return { orders, committed: null, correctOrder };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "commit") return null;
    const order = (cmd.payload?.order as string[] | undefined) ?? [];
    state.committed = order;

    const ok = order.length === state.correctOrder.length &&
      order.every((id, i) => id === state.correctOrder[i]);

    if (!ok) {
      const missed = order.filter((id, i) => id !== state.correctOrder[i]).length;
      ctx.charge({
        reason: "deadline_missed",
        omr: -60 * missed,
        messageKey: "rule.R-DEADLINE-01",
        params: { missed },
      });
    }
    ctx.emit("committed", { ok });
    return { stage: "sequence", sequencedByUrgency: ok };
  },

  isComplete(state) {
    return state.committed !== null;
  },

  score(state, ctx) {
    if (!state.committed) return parts(0, ctx.tick * 50, 90_000, 0, 240);
    const right = state.committed.filter((id, i) => id === state.correctOrder[i]).length;
    return parts(
      right / state.correctOrder.length,
      ctx.tick * 50,
      90_000,
      ctx.ledger.lost(),
      240,
    );
  },
};

/* ------------------------------------------------------------------ 1.5 */

export interface GhostSoState {
  /** What the dispatch inbox references. */
  inbox: string[];
  /** What the SO list actually shows - one short. */
  list: string[];
  missingId: string;
  guess: string | null;
  reported: boolean;
  wrongGuesses: number;
}

export const L1_5_GhostSo: LevelDefinition<GhostSoState> = {
  id: "1.5",
  durationMs: 6 * MIN,
  rules: rules.order,

  init(rng: Rng): GhostSoState {
    const inbox = Array.from({ length: 8 }, () => `SO-${rng.int(1000, 9999)}`);
    const missingId = rng.pick(inbox);
    return {
      inbox,
      list: rng.shuffle(inbox.filter((id) => id !== missingId)),
      missingId,
      guess: null,
      reported: false,
      wrongGuesses: 0,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type === "guess") {
      const guess = String(cmd.payload?.id ?? "");
      if (guess === state.missingId) {
        state.guess = guess;
        ctx.emit("found", { id: guess });
      } else {
        state.wrongGuesses += 1;
        ctx.emit("notFound", { id: guess });
      }
      return null;
    }

    if (cmd.type === "report") {
      if (state.guess !== state.missingId) return null;
      state.reported = true;
      // Reporting the bug is the scored correct answer, not an extra
      // (PRD 1.5) - so it earns, it does not merely avoid a penalty.
      ctx.charge({
        reason: "correct_call",
        omr: 80,
        messageKey: "l1_5.reported",
      });
      ctx.emit("reported", {});
      return { stage: "reconcile", reportedMissingSo: true };
    }

    return null;
  },

  isComplete(state) {
    return state.reported;
  },

  score(state, ctx) {
    const found = state.guess === state.missingId ? 1 : 0;
    const penalty = Math.min(0.5, state.wrongGuesses * 0.1);
    const accuracy = Math.max(0, found - penalty);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), 200);
  },
};

/* ------------------------------------------------------------------ registry */

/* eslint-disable @typescript-eslint/no-explicit-any */
export const LEVEL_DEFS: Record<string, LevelDefinition<any>> = {
  "0.2": L0_2_Glossary,
  "1.1": L1_1_ReadSo,
  "1.2": L1_2_CodeBreaker,
  "1.3": L1_3_MtToBags,
  "1.4": L1_4_Deadline,
  "1.5": L1_5_GhostSo,
  "3.2": D2.L3_2_Scale,
  "3.3": D2.L3_3_FreeKilos,
  "6.1": D2.L6_1_BaggedOrBulk,
  "6.3": D2.L6_3_ContractBoard,
  "6.4": D2.L6_4_SoharPoultry,
  "6.6": D2.L6_6_NoContract,
  "6.7": D2.L6_7_Ferry,
  "8.2": D2.L8_2_LabourForecast,
  "8.5": D2.L8_5_LeaveChain,
  "8.6": D2.L8_6_GhostHour,
};
