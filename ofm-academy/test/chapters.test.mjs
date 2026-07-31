/**
 * The teaching rules of chapters 3, 6 and 8, asserted individually.
 *
 * These are the levels the PRD rates highest, so each one is tested for the
 * thing it is supposed to teach - not merely that it runs.
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { load } from "./_load.mjs";

/* ---------------------------------------------------------------- Ch3 */

test("3.2 Scale: stopping late costs money, stopping on the mark does not", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L3_2_Scale } = await load("levels/defs2.ts");

  const sim = new Simulation(L3_2_Scale, 11, 0);

  // run the needle past 25.0 kg, then stop - the natural, expensive error
  while (sim.state.needle <= 25.4) sim.step();
  sim.submit("stop");

  const overfilled = sim.state.deviations[0];
  assert.ok(overfilled > 0, `expected an overfill, got ${overfilled} g`);
  assert.ok(sim.ledger.total() < 0, "overfill must cost OMR");
});

test("3.2 Scale: underfill is recorded but not charged as giveaway", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L3_2_Scale } = await load("levels/defs2.ts");

  const sim = new Simulation(L3_2_Scale, 12, 0);
  sim.submit("stop"); // needle still near zero - a heavy underfill

  assert.ok(sim.state.deviations[0] < 0, "should record a negative deviation");
  assert.equal(sim.ledger.total(), 0, "underfill is a different problem, not giveaway");
});

test("3.3 Free Kilos: 25.4 kg gives away 400 kg on a 25 MT truck", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L3_3_FreeKilos } = await load("levels/defs2.ts");

  const sim = new Simulation(L3_3_FreeKilos, 1, 0);
  assert.equal(sim.state.bagsPerTruck, 1000, "25 MT at 40 bags/MT");

  sim.submit("run", { setting: 25.4 });

  // 0.4 kg over, 1,000 bags - the exact figure the level is named after
  assert.equal(Math.round(sim.state.totalGivenKg), 400);
  assert.ok(sim.ledger.total() < 0);
});

test("3.3 Free Kilos: running at 25.0 gives nothing away and scores clean", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L3_3_FreeKilos } = await load("levels/defs2.ts");

  const sim = new Simulation(L3_3_FreeKilos, 2, 0);
  for (let i = 0; i < 3; i++) sim.submit("run", { setting: 25.0 });

  assert.equal(sim.state.totalGivenKg, 0);
  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

/* ---------------------------------------------------------------- Ch6 */

test("6.1 Bagged or Bulk: the rules engine, not the level, decides", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_1_BaggedOrBulk } = await load("levels/defs2.ts");

  const sim = new Simulation(L6_1_BaggedOrBulk, 3, 0);
  const round = sim.state.rounds[0];
  const wrong = round.form === "bag" ? "tipper" : "flatbed";

  const violations = sim.submit("book", { truckType: wrong });
  assert.ok(violations.length > 0, "a mismatched truck must violate a rule");
  assert.ok(
    ["R-TRUCKTYPE-01", "R-TRUCKTYPE-02"].includes(violations[0].ruleId),
    `unexpected rule ${violations[0].ruleId}`,
  );
});

test("6.4 Sohar Poultry: the tipper is refused even though a tipper serves the route", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_4_SoharPoultry } = await load("levels/defs2.ts");

  const sim = new Simulation(L6_4_SoharPoultry, 4, 0);

  // both carriers really do hold a Sohar Poultry contract
  assert.equal(sim.state.options.length, 2);
  const flat = sim.state.options.find((o) => o.truckType === "flatbed");
  const tip = sim.state.options.find((o) => o.truckType === "tipper");
  assert.ok(flat && tip, "the trap needs one of each truck type");

  // and the tipper is the more expensive one, so price is not the tell
  assert.ok(tip.rateOmr > flat.rateOmr, "expected the tipper to cost more");

  const violations = sim.submit("choose", { transporterId: tip.transporterId });
  assert.ok(violations.length > 0, "premix is bagged - the tipper cannot carry it");
  assert.equal(violations[0].ruleId, "R-TRUCKTYPE-01");
});

test("6.4 Sohar Poultry: right carrier for the wrong reason is still penalised", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_4_SoharPoultry } = await load("levels/defs2.ts");

  const sim = new Simulation(L6_4_SoharPoultry, 5, 0);
  const flat = sim.state.options.find((o) => o.truckType === "flatbed");

  sim.submit("choose", { transporterId: flat.transporterId });
  sim.submit("reason", { why: "price" });

  assert.ok(
    sim.ledger.total() < 0,
    "choosing on price happens to work here and will fail on the next order",
  );
  assert.ok(sim.result().parts.accuracy < 1);
});

test("6.4 Sohar Poultry: cargo form is the reason that scores", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_4_SoharPoultry } = await load("levels/defs2.ts");

  const sim = new Simulation(L6_4_SoharPoultry, 6, 0);
  const flat = sim.state.options.find((o) => o.truckType === "flatbed");

  sim.submit("choose", { transporterId: flat.transporterId });
  sim.submit("reason", { why: "cargoForm" });

  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
  assert.equal(sim.isEnded(), true);
});

test("6.6 No Contract: escalating earns, improvising costs", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_6_NoContract } = await load("levels/defs2.ts");

  const good = new Simulation(L6_6_NoContract, 7, 0);
  good.submit("decide", { action: "escalate" });
  assert.ok(good.ledger.total() > 0, "escalating is the scored correct answer");
  assert.equal(good.result().parts.accuracy, 1);

  const bad = new Simulation(L6_6_NoContract, 7, 0);
  const violations = bad.submit("decide", { action: "improvise" });
  assert.ok(violations.length > 0, "improvising a rate must violate R-CONTRACT-01");
  assert.equal(violations[0].ruleId, "R-CONTRACT-01");
  assert.equal(bad.result().parts.accuracy, 0);
});

test("6.7 Ferry: a departure you cannot reach fails, and so does one that lands late", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_7_Ferry } = await load("levels/defs2.ts");

  const tooEarly = new Simulation(L6_7_Ferry, 8, 0);
  const early = tooEarly.state.departures.find((h) => h < tooEarly.state.driveH);
  if (early !== undefined) {
    tooEarly.submit("book", { departH: early });
    assert.ok(tooEarly.ledger.total() < 0, "cannot reach Shannah in time");
  }

  const ok = new Simulation(L6_7_Ferry, 8, 0);
  const good = ok.state.departures.find(
    (h) => h >= ok.state.driveH && h + ok.state.crossingH <= ok.state.dueInH,
  );
  if (good !== undefined) {
    ok.submit("book", { departH: good });
    assert.equal(ok.ledger.total(), 0);
    assert.equal(ok.result().parts.accuracy, 1);
  }
});

/* ---------------------------------------------------------------- Ch8 */

test("8.2 Labour Forecast: over-crewing burns idle labour at OMR 4/head", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_2_LabourForecast, OMR_PER_HEAD } = await load("levels/defs2.ts");

  assert.equal(OMR_PER_HEAD, 4, "confirmed rate from the PRD");

  const sim = new Simulation(L8_2_LabourForecast, 9, 0);
  const need = sim.state.needCrew;
  sim.submit("commit", {
    belts: sim.state.needBelts,
    bays: sim.state.needBays,
    crew: need + 5,
  });

  assert.equal(sim.ledger.total(), -5 * OMR_PER_HEAD, "5 idle heads at OMR 4");
});

test("8.2 Labour Forecast: under-crewing leaves trucks waiting", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_2_LabourForecast } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_2_LabourForecast, 10, 0);
  sim.submit("commit", {
    belts: sim.state.needBelts,
    bays: sim.state.needBays,
    crew: Math.max(4, sim.state.needCrew - 8),
  });

  const reasons = sim.ledger.byReason().map((r) => r.reason);
  assert.ok(reasons.includes("truck_waiting"), "short crew must strand trucks");
  assert.ok(sim.ledger.total() < 0);
});

test("8.2 Labour Forecast: the exact plan costs nothing", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_2_LabourForecast } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_2_LabourForecast, 13, 0);
  sim.submit("commit", {
    belts: sim.state.needBelts,
    bays: sim.state.needBays,
    crew: sim.state.needCrew,
  });

  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

test("8.5 Leave Chain: same-team cover is illegal, not merely worse", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_5_LeaveChain } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_5_LeaveChain, 14, 0);
  const absent = sim.state.people.find((p) => p.id === sim.state.absentId);
  const sameTeam = sim.state.people.find(
    (p) => p.id !== absent.id && p.team === absent.team,
  );

  sim.submit("pick", { id: sameTeam.id });

  assert.equal(sim.state.coverId, null, "an illegal pick must not be accepted at all");
  assert.ok(sim.ledger.total() < 0);
});

test("8.5 Leave Chain: opposite team on the same shift is a clean cover", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_5_LeaveChain } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_5_LeaveChain, 15, 0);
  const absent = sim.state.people.find((p) => p.id === sim.state.absentId);
  const legal = sim.state.people.find(
    (p) => p.team !== absent.team && p.shift === absent.shift,
  );

  sim.submit("pick", { id: legal.id });
  sim.submit("confirm");

  assert.equal(sim.state.coverId, legal.id);
  assert.equal(sim.ledger.total(), 0, "a correct chain leaves no gap and costs nothing");
  assert.equal(sim.result().parts.accuracy, 1);
});

test("8.5 Leave Chain: right team, wrong shift leaves a coverage gap", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_5_LeaveChain } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_5_LeaveChain, 16, 0);
  const absent = sim.state.people.find((p) => p.id === sim.state.absentId);
  const wrongShift = sim.state.people.find(
    (p) => p.team !== absent.team && p.shift !== absent.shift,
  );

  sim.submit("pick", { id: wrongShift.id });
  sim.submit("confirm");

  assert.ok(sim.ledger.total() < 0, "the vacated shift is still uncovered");
});

test("8.6 Ghost Hour: posting before the rollover files on the previous day", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_6_GhostHour } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_6_GhostHour, 17, 0);
  assert.equal(sim.state.rolloverHour, 3, "00:00 CET is 03:00 in Muscat");

  const early = sim.state.choices.find((h) => h < sim.state.rolloverHour);
  sim.submit("post", { hour: early });

  assert.equal(sim.state.filedOnPreviousDay, true);
  assert.ok(sim.ledger.total() < 0, "the daily report will not match");
  assert.equal(sim.result().parts.accuracy, 0);
});

test("8.6 Ghost Hour: waiting until after the rollover is clean", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L8_6_GhostHour } = await load("levels/defs2.ts");

  const sim = new Simulation(L8_6_GhostHour, 18, 0);
  const late = sim.state.choices.find((h) => h >= sim.state.rolloverHour);
  sim.submit("post", { hour: late });

  assert.equal(sim.state.filedOnPreviousDay, false);
  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

/* ---------------------------------------------------------------- wiring */

test("every registered level has a definition and a view", async () => {
  const { LEVEL_DEFS } = await load("levels/defs.ts");
  const { CHAPTERS } = await load("levels/registry.ts");
  const { strings } = await load("content/index.ts");

  const built = CHAPTERS.flatMap((c) => c.levels.filter((l) => l.built));
  assert.ok(built.length >= 16, `expected the full built set, got ${built.length}`);

  for (const l of built) {
    assert.ok(LEVEL_DEFS[l.id], `level ${l.id} is marked built but has no definition`);
    for (const lang of ["en", "ar"]) {
      const block = strings[lang][l.titleKey];
      assert.ok(block, `level ${l.id} has no ${lang} strings under ${l.titleKey}`);
      assert.ok(block.title?.length > 0, `level ${l.id} has no ${lang} title`);
      assert.ok(block.objective?.length > 0, `level ${l.id} has no ${lang} objective`);
    }
  }
});

test("every built level runs to completion without throwing", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { LEVEL_DEFS } = await load("levels/defs.ts");

  for (const [id, def] of Object.entries(LEVEL_DEFS)) {
    const sim = new Simulation(def, 4242, 0);
    // ticking alone must never throw, whatever the level does per-step
    for (let i = 0; i < 200 && !sim.isEnded(); i++) sim.step();
    const res = sim.result();
    assert.equal(typeof res.score, "number", `${id} produced no score`);
    assert.ok(res.score >= 0 && res.score <= 1000, `${id} scored out of range: ${res.score}`);
  }
});
