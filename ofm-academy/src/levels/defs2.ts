/**
 * Chapters 3, 6 and 8 - the three the PRD rates highest and the three
 * personas the arcade never reached.
 *
 * Ch3 is the money lesson (overfill), Ch6 is the routing trap, Ch8 is the
 * whole Shift Supervisor job.
 */

import type { Command, LevelDefinition, ScoreParts, SimContext } from "../sim/engine";
import type { Rng } from "../sim/rng";
import { BAGS_PER_MT, KG_PER_BAG } from "../sim/entities";
import { contracts, contractsFor, coreCodes, customers, ferry, rules, transporters } from "../content";

const MIN = 60_000;

function speedScore(elapsedMs: number, parMs: number): number {
  if (elapsedMs <= parMs) return 1;
  return Math.max(0, 1 - (elapsedMs - parMs) / (parMs * 2));
}

function parts(accuracy: number, elapsedMs: number, parMs: number, lost: number, cap: number): ScoreParts {
  return {
    accuracy: Math.max(0, Math.min(1, accuracy)),
    speed: speedScore(elapsedMs, parMs),
    cost: Math.max(0, 1 - lost / cap),
    safety: 1,
  };
}

/* ================================================================= 3.2
   The Scale. The overfill lesson, one bag at a time.

   The needle drifts past the mark; stopping late is the natural error and
   it is the expensive one. Deviation is measured in grams because that is
   the unit the money hides in. */

export interface ScaleState {
  bags: number;
  index: number;
  /** Signed deviation in grams for each filled bag. */
  deviations: number[];
  /** Where the needle is right now, in kg. */
  needle: number;
  /** How fast the needle climbs, kg per tick. Varies per bag. */
  rate: number;
  rates: number[];
}

const SCALE_TARGET_KG = KG_PER_BAG;

export const L3_2_Scale: LevelDefinition<ScaleState> = {
  id: "3.2",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): ScaleState {
    // Each bag fills at a slightly different rate, so the learner cannot
    // simply memorise a beat - they have to watch the needle.
    const rates = Array.from({ length: 20 }, () => rng.float(0.055, 0.115));
    return { bags: 20, index: 0, deviations: [], needle: 0, rate: rates[0], rates };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "stop") return null;
    if (state.index >= state.bags) return null;

    const grams = Math.round((state.needle - SCALE_TARGET_KG) * 1000);
    state.deviations.push(grams);
    state.index += 1;
    state.needle = 0;
    state.rate = state.rates[state.index] ?? state.rates[0];

    // Only overfill costs money - underfill is a different problem (short
    // delivery), and conflating them would teach the wrong lesson here.
    if (grams > 0) {
      const kgGiven = (grams / 1000) * 1; // this bag
      ctx.charge({
        reason: "overfill",
        omr: -Math.max(1, Math.round(kgGiven * 10)),
        messageKey: "reason.overfill",
        params: { grams },
      });
    }
    ctx.emit("bagFilled", { grams });
    return null;
  },

  step(state) {
    if (state.index >= state.bags) return;
    state.needle += state.rate;
    // the needle keeps climbing past the mark - that is the whole point
    if (state.needle > SCALE_TARGET_KG * 1.4) state.needle = SCALE_TARGET_KG * 1.4;
  },

  isComplete(state) {
    return state.index >= state.bags;
  },

  score(state, ctx) {
    if (state.deviations.length === 0) return parts(0, ctx.tick * 50, 90_000, 0, 200);
    const avgAbs =
      state.deviations.reduce((s, g) => s + Math.abs(g), 0) / state.deviations.length;
    // 3-star target from the PRD: average deviation <= 50 g
    const accuracy = Math.max(0, 1 - avgAbs / 250);
    return parts(accuracy, ctx.tick * 50, 120_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 3.3
   400 Free Kilos. The reveal.

   The learner picks a line setting believing a heavier bag runs faster and
   safer. Nothing looks wrong during the run. The shift report then shows
   what left the site free, and what that is per year.

   Confirmed figure: ~OMR 18,000/yr per line of overfill exposure. */

export interface FreeKilosState {
  /** Bags on this truck - 25 MT at 40 bags/MT. */
  bagsPerTruck: number;
  /** Target the learner set, in kg. */
  setting: number | null;
  rounds: number;
  done: number;
  totalGivenKg: number;
}

const SETTINGS_KG = [25.0, 25.2, 25.4];

export const L3_3_FreeKilos: LevelDefinition<FreeKilosState> = {
  id: "3.3",
  durationMs: 6 * MIN,
  rules: [],

  init(): FreeKilosState {
    return { bagsPerTruck: 25 * BAGS_PER_MT, setting: null, rounds: 3, done: 0, totalGivenKg: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "run") return null;
    const setting = Number(cmd.payload?.setting);
    if (!SETTINGS_KG.includes(setting)) return null;

    state.setting = setting;
    const overPerBagKg = Math.max(0, setting - KG_PER_BAG);
    const givenKg = overPerBagKg * state.bagsPerTruck;
    state.totalGivenKg += givenKg;
    state.done += 1;

    if (givenKg > 0) {
      // priced against feed cost per kg, which is still TODO_CONFIRM
      ctx.charge({
        reason: "overfill",
        omr: -Math.round(givenKg),
        messageKey: "reason.overfill",
        params: { kg: Math.round(givenKg) },
      });
    }
    ctx.emit("truckRan", { setting, givenKg });
    return null;
  },

  isComplete(state) {
    return state.done >= state.rounds;
  },

  score(state, ctx) {
    // A perfect run gives nothing away. Every kilo is a straight loss.
    const worst = 0.4 * state.bagsPerTruck * state.rounds;
    const accuracy = Math.max(0, 1 - state.totalGivenKg / worst);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), worst);
  },
};

/* ================================================================= 6.1
   Bagged or Bulk. The fundamental fork.

   Runs entirely through the rules engine, so the answer key is the same
   JSON that would validate a real booking. */

export interface FormForkState {
  rounds: { form: "bag" | "bulk"; code: string }[];
  index: number;
  errors: number;
}

export const L6_1_BaggedOrBulk: LevelDefinition<FormForkState> = {
  id: "6.1",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(rng: Rng): FormForkState {
    const rounds = Array.from({ length: 6 }, () => ({
      form: (rng.next() < 0.5 ? "bag" : "bulk") as "bag" | "bulk",
      code: rng.pick(coreCodes),
    }));
    return { rounds, index: 0, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "book") return null;
    const round = state.rounds[state.index];
    if (!round) return null;
    const truckType = String(cmd.payload?.truckType);

    const correct = round.form === "bag" ? "flatbed" : "tipper";
    const ok = truckType === correct;
    if (!ok) state.errors += 1;

    state.index += 1;
    ctx.emit("booked", { ok });
    // the rules engine decides, not a hardcoded comparison
    return { cargoForm: round.form, truckType };
  },

  isComplete(state) {
    return state.index >= state.rounds.length;
  },

  score(state, ctx) {
    const total = state.rounds.length;
    const accuracy = (total - state.errors) / total;
    return parts(accuracy, ctx.tick * 50, 45_000, ctx.ledger.lost(), 540);
  },
};

/* ================================================================= 6.3
   The Contract Board. Answer key is contracts.json. */

export interface ContractBoardState {
  rounds: {
    customerId: string;
    customerName: string;
    destination: string;
    form: "bag" | "bulk";
    /** transporter ids that actually hold a contract for this route */
    valid: string[];
  }[];
  index: number;
  errors: number;
}

export const L6_3_ContractBoard: LevelDefinition<ContractBoardState> = {
  id: "6.3",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(rng: Rng): ContractBoardState {
    // only customers something is actually contracted for
    const covered = customers.filter((c) => contractsFor(c).length > 0);
    const rounds = rng.sample(covered, Math.min(5, covered.length)).map((c) => {
      const cs = contractsFor(c);
      // cargo form follows whatever truck type the contract uses
      const form: "bag" | "bulk" = cs.some((x) => x.truckType === "flatbed") ? "bag" : "bulk";
      const need = form === "bag" ? "flatbed" : "tipper";
      return {
        customerId: c.id,
        customerName: c.nameEn,
        destination: c.destination,
        form,
        valid: cs.filter((x) => x.truckType === need).map((x) => x.transporterId),
      };
    });
    return { rounds, index: 0, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "assign") return null;
    const round = state.rounds[state.index];
    if (!round) return null;
    const transporterId = String(cmd.payload?.transporterId ?? "");

    const ok = round.valid.includes(transporterId);
    if (!ok) {
      state.errors += 1;
      ctx.charge({
        reason: "no_contract_escalated",
        omr: -120,
        messageKey: "rule.R-CONTRACT-01",
        params: { transporterId },
      });
    }
    state.index += 1;
    ctx.emit("assigned", { ok });
    return { hasContract: ok, action: ok ? "book" : "improvise" };
  },

  isComplete(state) {
    return state.index >= state.rounds.length;
  },

  score(state, ctx) {
    const total = state.rounds.length || 1;
    return parts((total - state.errors) / total, ctx.tick * 50, 90_000, ctx.ledger.lost(), 600);
  },
};

/* ================================================================= 6.4
   Sohar Poultry - the trap.

   Two carriers serve it. GWC runs a flat bed at 90; Al Sahab runs a tipper
   at 160. The cargo is premix in 25 kg bags, so the flat bed is the only
   one that can carry it - and it also happens to be cheaper. Choosing on
   price alone gets the right answer for the wrong reason, so the level
   also asks WHY, and only the cargo-form reason scores. */

export interface SoharTrapState {
  options: { transporterId: string; name: string; truckType: string; rateOmr: number | null }[];
  chosen: string | null;
  reason: string | null;
  errors: number;
}

export const L6_4_SoharPoultry: LevelDefinition<SoharTrapState> = {
  id: "6.4",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(): SoharTrapState {
    const serving = contracts.filter((c) => c.route === "soharpoult");
    const options = serving.map((c) => ({
      transporterId: c.transporterId,
      name: transporters.find((t) => t.id === c.transporterId)?.name ?? c.transporterId,
      truckType: c.truckType,
      rateOmr: c.rateOmr,
    }));
    return { options, chosen: null, reason: null, errors: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type === "choose") {
      const id = String(cmd.payload?.transporterId ?? "");
      state.chosen = id;
      const opt = state.options.find((o) => o.transporterId === id);
      const ok = opt?.truckType === "flatbed";
      if (!ok) state.errors += 1;
      ctx.emit("chose", { ok });
      // premix is bagged, so the rules engine judges the truck type
      return { cargoForm: "bag", truckType: opt?.truckType ?? "unknown" };
    }

    if (cmd.type === "reason") {
      const why = String(cmd.payload?.why ?? "");
      state.reason = why;
      if (why !== "cargoForm") {
        // right answer, wrong reason - it will not transfer to the next order
        state.errors += 1;
        ctx.charge({
          reason: "wrong_truck_type",
          omr: -40,
          messageKey: "l6_4.trap",
          params: { why },
        });
      }
      ctx.emit("reasoned", { why });
      return null;
    }
    return null;
  },

  isComplete(state) {
    return state.chosen !== null && state.reason !== null;
  },

  score(state, ctx) {
    const accuracy = Math.max(0, 1 - state.errors / 2);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 6.6
   No Contract. Escalating is the scored correct answer, not a cop-out. */

export interface NoContractState {
  route: string;
  decided: string | null;
}

export const L6_6_NoContract: LevelDefinition<NoContractState> = {
  id: "6.6",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(rng: Rng): NoContractState {
    // a destination with no contract row at all
    const contracted = new Set(contracts.map((c) => c.route));
    const uncovered = customers.filter(
      (c) => !contracted.has(c.id) && !contracted.has(c.destination),
    );
    const route = uncovered.length > 0 ? rng.pick(uncovered).nameEn : "Duqm";
    return { route, decided: null };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "decide") return null;
    const action = String(cmd.payload?.action ?? "");
    state.decided = action;

    if (action === "escalate") {
      ctx.charge({
        reason: "no_contract_escalated",
        omr: 60,
        messageKey: "reason.no_contract_escalated",
      });
    }
    ctx.emit("decided", { action });
    return { hasContract: false, action };
  },

  isComplete(state) {
    return state.decided !== null;
  },

  score(state, ctx) {
    return parts(state.decided === "escalate" ? 1 : 0, ctx.tick * 50, 30_000, ctx.ledger.lost(), 120);
  },
};

/* ================================================================= 6.7
   The Ferry. Transit is not distance. */

export interface FerryState {
  /** Hours from now that the customer needs it. */
  dueInH: number;
  driveH: number;
  crossingH: number;
  /** Ferry departures, in hours from now. */
  departures: number[];
  chosen: number | null;
  surchargeOmr: number;
}

export const L6_7_Ferry: LevelDefinition<FerryState> = {
  id: "6.7",
  durationMs: 6 * MIN,
  rules: rules.routing,

  init(rng: Rng): FerryState {
    const driveH = rng.int(5, 8);
    const crossingH = 2;
    const dueInH = rng.int(16, 26);
    // one departure is too early to reach, one is too late to arrive
    const departures = [driveH - 2, driveH + 1, dueInH - crossingH + 2].map((h) =>
      Math.max(1, Math.round(h)),
    );
    return {
      dueInH,
      driveH,
      crossingH,
      departures: [...new Set(departures)].sort((a, b) => a - b),
      chosen: null,
      surchargeOmr: ferry.surchargeOmr,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "book") return null;
    const departH = Number(cmd.payload?.departH);
    state.chosen = departH;

    const canReach = departH >= state.driveH;
    const arrives = departH + state.crossingH;
    const inTime = arrives <= state.dueInH;
    const ok = canReach && inTime;

    if (!ok) {
      ctx.charge({
        reason: "ferry_missed",
        omr: -state.surchargeOmr,
        messageKey: "rule.R-FERRY-01",
        params: { departH },
      });
    }
    ctx.emit("ferryBooked", { ok, arrives });
    return { requiresFerry: true, ferryBooked: ok };
  },

  isComplete(state) {
    return state.chosen !== null;
  },

  score(state, ctx) {
    const departH = state.chosen ?? -1;
    const ok = departH >= state.driveH && departH + state.crossingH <= state.dueInH;
    return parts(ok ? 1 : 0, ctx.tick * 50, 45_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 8.2
   Labour Forecast - the SLS Stage-2 level.

   Target output format, confirmed from the pitch:
     "Open 3 belts + 1 bay -> need 18 people - Day 11 / Night 7"

   Idle labour is charged at the confirmed OMR 4/head rate. Trucks waiting
   cost demurrage, which is still TODO_CONFIRM, so it is a constant here. */

export const OMR_PER_HEAD = 4;
const DEMURRAGE_PER_TRUCK = 6; // TODO_CONFIRM - PRD 14 Q8

export interface LabourState {
  /** Today's confirmed orders in MT, not an average. */
  ordersMt: number[];
  totalMt: number;
  /** What the correct plan is, derived from the orders. */
  needBelts: number;
  needBays: number;
  needCrew: number;
  needDay: number;
  needNight: number;
  planned: { belts: number; bays: number; crew: number } | null;
}

/** One belt clears roughly 30 MT in a shift; a bay serves ~2 belts. */
function planFor(totalMt: number) {
  const belts = Math.max(1, Math.ceil(totalMt / 30));
  const bays = Math.max(1, Math.ceil(belts / 2));
  const crew = belts * 4 + bays * 2 + 4; // crew + bay hands + supervision
  const day = Math.ceil(crew * 0.6);
  return { belts, bays, crew, day, night: crew - day };
}

export const L8_2_LabourForecast: LevelDefinition<LabourState> = {
  id: "8.2",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): LabourState {
    const ordersMt = Array.from({ length: rng.int(3, 6) }, () => rng.pick([12.5, 17.5, 25, 30, 35]));
    const totalMt = ordersMt.reduce((a, b) => a + b, 0);
    const p = planFor(totalMt);
    return {
      ordersMt,
      totalMt,
      needBelts: p.belts,
      needBays: p.bays,
      needCrew: p.crew,
      needDay: p.day,
      needNight: p.night,
      planned: null,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "commit") return null;
    const belts = Number(cmd.payload?.belts);
    const bays = Number(cmd.payload?.bays);
    const crew = Number(cmd.payload?.crew);
    state.planned = { belts, bays, crew };

    // Over-crewing burns idle labour; under-crewing leaves trucks waiting.
    // Both cost money, which is the entire lesson.
    const idle = Math.max(0, crew - state.needCrew);
    if (idle > 0) {
      ctx.charge({
        reason: "idle_labour",
        omr: -idle * OMR_PER_HEAD,
        messageKey: "reason.idle_labour",
        params: { heads: idle },
      });
    }
    const short = Math.max(0, state.needCrew - crew);
    if (short > 0) {
      const trucksWaiting = Math.ceil(short / 4);
      ctx.charge({
        reason: "truck_waiting",
        omr: -trucksWaiting * DEMURRAGE_PER_TRUCK,
        messageKey: "reason.truck_waiting",
        params: { trucks: trucksWaiting },
      });
    }
    ctx.emit("planned", { belts, bays, crew });
    return null;
  },

  isComplete(state) {
    return state.planned !== null;
  },

  score(state, ctx) {
    if (!state.planned) return parts(0, ctx.tick * 50, 90_000, 0, 200);
    const off =
      Math.abs(state.planned.belts - state.needBelts) +
      Math.abs(state.planned.bays - state.needBays) +
      Math.abs(state.planned.crew - state.needCrew) / 4;
    const accuracy = Math.max(0, 1 - off / 6);
    return parts(accuracy, ctx.tick * 50, 90_000, ctx.ledger.lost(), 200);
  },
};

/* ================================================================= 8.5
   The Leave Chain.

   Locked rule (PRD 4.12): the replacement comes from the OPPOSITE team
   only, covers the absent person's exact shift, and their own colleague
   chain-shifts to cover the vacated slot. Same-team cover is illegal, not
   merely suboptimal. */

export interface RosterPerson {
  id: string;
  roleLabel: string;
  team: "A" | "B";
  shift: "day" | "night";
}

export interface LeaveChainState {
  people: RosterPerson[];
  absentId: string;
  coverId: string | null;
  confirmed: boolean;
  illegalPicks: number;
}

export const L8_5_LeaveChain: LevelDefinition<LeaveChainState> = {
  id: "8.5",
  durationMs: 6 * MIN,
  rules: [],

  init(rng: Rng): LeaveChainState {
    // Anonymised role labels - real colleague names never ship (PRD 4.3).
    const people: RosterPerson[] = [];
    let n = 1;
    for (const team of ["A", "B"] as const) {
      for (const shift of ["day", "night"] as const) {
        for (let i = 0; i < 2; i++) {
          people.push({
            id: `p${n}`,
            roleLabel: `Forklift Operator ${n}`,
            team,
            shift,
          });
          n += 1;
        }
      }
    }
    const absent = rng.pick(people);
    return { people, absentId: absent.id, coverId: null, confirmed: false, illegalPicks: 0 };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    const absent = state.people.find((p) => p.id === state.absentId)!;

    if (cmd.type === "pick") {
      const id = String(cmd.payload?.id ?? "");
      const person = state.people.find((p) => p.id === id);
      if (!person) return null;

      if (person.team === absent.team) {
        // illegal: leaves the absent person's own team a head short
        state.illegalPicks += 1;
        ctx.charge({
          reason: "idle_labour",
          omr: -30,
          messageKey: "l8_5.sameTeam",
        });
        ctx.emit("illegalPick", { id });
        return null;
      }
      state.coverId = id;
      ctx.emit("picked", { id });
      return null;
    }

    if (cmd.type === "confirm") {
      if (!state.coverId) return null;
      const cover = state.people.find((p) => p.id === state.coverId)!;
      state.confirmed = true;
      // must also match the absent person's exact shift
      const shiftOk = cover.shift === absent.shift;
      if (!shiftOk) {
        ctx.charge({
          reason: "idle_labour",
          omr: -40,
          messageKey: "l8_5.gap",
        });
      }
      ctx.emit("confirmed", { shiftOk });
      return null;
    }
    return null;
  },

  isComplete(state) {
    return state.confirmed;
  },

  score(state, ctx) {
    const absent = state.people.find((p) => p.id === state.absentId)!;
    const cover = state.people.find((p) => p.id === state.coverId);
    const legal = cover ? cover.team !== absent.team && cover.shift === absent.shift : false;
    const accuracy = Math.max(0, (legal ? 1 : 0) - state.illegalPicks * 0.25);
    return parts(accuracy, ctx.tick * 50, 60_000, ctx.ledger.lost(), 150);
  },
};

/* ================================================================= 8.6
   The Ghost Hour.

   The clock already models the trap; this level just makes the learner
   feel it. Posting before the rollover files the load on the PREVIOUS
   production day, and the daily report stops matching. */

export interface GhostHourState {
  /** Oman-local hours the learner can choose to post at. */
  choices: number[];
  rolloverHour: number;
  posted: number | null;
  filedOnPreviousDay: boolean;
}

export const L8_6_GhostHour: LevelDefinition<GhostHourState> = {
  id: "8.6",
  durationMs: 6 * MIN,
  rules: [],

  init(_rng: Rng, clock): GhostHourState {
    const rolloverHour = clock.rolloverHourOmanLocal();
    // two before the rollover, two after - the trap is not obvious
    const choices = [1, 2, rolloverHour + 1, rolloverHour + 3].filter((h) => h < 24);
    return {
      choices: [...new Set(choices)].sort((a, b) => a - b),
      rolloverHour,
      posted: null,
      filedOnPreviousDay: false,
    };
  },

  apply(state, cmd: Command, ctx: SimContext) {
    if (cmd.type !== "post") return null;
    const hour = Number(cmd.payload?.hour);
    state.posted = hour;

    // before the rollover, the mill is still on yesterday's production day
    const previous = hour < state.rolloverHour;
    state.filedOnPreviousDay = previous;

    if (previous) {
      ctx.charge({
        reason: "day_boundary_misposted",
        omr: -75,
        messageKey: "hud.ghostHour",
        params: { hour },
      });
    }
    ctx.emit("posted", { hour, previous });
    return null;
  },

  isComplete(state) {
    return state.posted !== null;
  },

  score(state, ctx) {
    return parts(state.filedOnPreviousDay ? 0 : 1, ctx.tick * 50, 45_000, ctx.ledger.lost(), 150);
  },
};
