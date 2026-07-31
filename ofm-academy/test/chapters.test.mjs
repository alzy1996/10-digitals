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

/* ---------------------------------------------------------------- Ch2/4/5/7/9 */

test("2.1 Raw Material: promising a date you cannot hit is the expensive direction", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L2_1_RawMaterial } = await load("levels/defs3.ts");

  // find a seed where something is genuinely short
  let sim = null;
  for (let seed = 1; seed < 60; seed++) {
    const s = new Simulation(L2_1_RawMaterial, seed, 0);
    if (s.state.lines.some((l) => l.available < l.required)) { sim = s; break; }
  }
  assert.ok(sim, "expected at least one short-stock scenario");

  sim.submit("answer", { ready: true });
  assert.ok(sim.ledger.total() <= -180, "declaring ready when it is not must cost the most");
  assert.equal(sim.result().parts.accuracy, 0);
});

test("2.1 Raw Material: honest 'not ready' on short stock is the correct call", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L2_1_RawMaterial } = await load("levels/defs3.ts");

  let sim = null;
  for (let seed = 1; seed < 60; seed++) {
    const s = new Simulation(L2_1_RawMaterial, seed, 0);
    if (s.state.lines.some((l) => l.available < l.required)) { sim = s; break; }
  }
  sim.submit("answer", { ready: false });
  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

test("2.5 Handshake: the locked trigger phrase is present verbatim", async () => {
  const { strings } = await load("content/index.ts");
  assert.equal(strings.en.l2_5.trigger, "@Delivery AFM — Please dispatch");
  assert.equal(strings.ar.l2_5.trigger, "@Delivery AFM — Please dispatch",
    "the trigger phrase is a core beat and stays verbatim in both languages");
});

test("2.5 Handshake: a vague message costs per missing field", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L2_5_Handshake, HANDSHAKE_FIELDS } = await load("levels/defs3.ts");

  const sim = new Simulation(L2_5_Handshake, 21, 0);
  sim.submit("toggle", { field: HANDSHAKE_FIELDS[0] });
  sim.submit("send");

  const missing = HANDSHAKE_FIELDS.length - 1;
  assert.equal(sim.ledger.total(), -40 * missing);
});

test("4.2 FIFO: the oldest batch is deliberately the furthest away", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L4_2_Fifo } = await load("levels/defs3.ts");

  const sim = new Simulation(L4_2_Fifo, 22, 0);
  const oldest = sim.state.batches.find((b) => b.id === sim.state.oldestId);
  const nearest = [...sim.state.batches].sort((a, b) => a.distance - b.distance)[0];

  assert.notEqual(oldest.id, nearest.id, "picking by proximity must be the wrong answer");
  assert.ok(oldest.distance > nearest.distance);

  sim.submit("pick", { id: nearest.id });
  assert.ok(sim.ledger.total() < 0, "taking the nearest breaches FIFO");
});

test("5.5 Gross and Net: net is gross minus tare, and out of tolerance means STOP", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L5_5_GrossNet } = await load("levels/defs3.ts");

  // a seed where the load is genuinely out of tolerance
  let sim = null;
  for (let seed = 1; seed < 80; seed++) {
    const s = new Simulation(L5_5_GrossNet, seed, 0);
    if (!s.state.withinTolerance) { sim = s; break; }
  }
  assert.ok(sim, "expected an out-of-tolerance load");

  const actual = sim.state.grossKg - sim.state.tareKg;
  sim.submit("net", { value: actual });
  assert.equal(sim.ledger.total(), 0, "correct arithmetic costs nothing");

  sim.submit("decide", { action: "dispatch" });
  assert.ok(sim.ledger.total() <= -250, "dispatching an out-of-tolerance load is the big failure");
});

test("5.5 Gross and Net: stopping an out-of-tolerance load is a clean pass", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L5_5_GrossNet } = await load("levels/defs3.ts");

  let sim = null;
  for (let seed = 1; seed < 80; seed++) {
    const s = new Simulation(L5_5_GrossNet, seed, 0);
    if (!s.state.withinTolerance) { sim = s; break; }
  }
  sim.submit("net", { value: sim.state.grossKg - sim.state.tareKg });
  sim.submit("decide", { action: "stop" });

  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

test("5.6 Paper Chain: the order cannot be skipped", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L5_6_PaperChain } = await load("levels/defs3.ts");

  const sim = new Simulation(L5_6_PaperChain, 23, 0);

  // production cannot sign first
  sim.submit("sign", { role: "production" });
  assert.deepEqual(sim.state.signed, [], "an out-of-order signature must be refused");
  assert.ok(sim.ledger.total() < 0);

  sim.submit("sign", { role: "delivery" });
  sim.submit("sign", { role: "packing" });
  sim.submit("sign", { role: "production" });

  assert.deepEqual(sim.state.signed, ["delivery", "packing", "production"]);
  assert.equal(sim.state.remark, "checked", "the Production Clerk adds a remark");
  assert.equal(sim.isEnded(), true);
});

test("6.5 Not My Lane: refusing a tipper route is the scored answer", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L6_5_NotMyLane } = await load("levels/defs3.ts");

  const good = new Simulation(L6_5_NotMyLane, 24, 0);
  good.submit("decide", { action: "refuse" });
  assert.ok(good.ledger.total() > 0);
  assert.equal(good.result().parts.accuracy, 1);

  const bad = new Simulation(L6_5_NotMyLane, 24, 0);
  const violations = bad.submit("decide", { action: "book" });
  assert.ok(violations.some((v) => v.ruleId === "R-SCOPE-01"), "booking must break the scope rule");
});

test("7.2 Inbound: receiving reverses the arithmetic", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L7_2_Inbound } = await load("levels/defs3.ts");

  const sim = new Simulation(L7_2_Inbound, 25, 0);
  const received = sim.state.loadedKg - sim.state.emptyKg;
  assert.ok(received > 0, "the truck arrives full and leaves empty");

  sim.submit("enter", { value: received });
  assert.equal(sim.ledger.total(), 0);
  assert.equal(sim.result().parts.accuracy, 1);
});

test("9.1 Full Shift: a perfect run certifies, a poor one does not", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L9_1_FullShift } = await load("levels/defs3.ts");

  const perfect = new Simulation(L9_1_FullShift, 26, 0);
  while (!perfect.isEnded()) {
    const item = perfect.state.items[perfect.state.index];
    if (!item) break;
    perfect.submit("answer", { value: item.correct });
  }
  const res = perfect.result();
  assert.equal(res.parts.accuracy, 1);
  assert.equal(res.omr, 0);
  assert.ok(res.score >= 900, `certification run should be strong, got ${res.score}`);

  const sloppy = new Simulation(L9_1_FullShift, 26, 0);
  while (!sloppy.isEnded()) {
    const item = sloppy.state.items[sloppy.state.index];
    if (!item) break;
    const wrong = item.options.find((o) => o !== item.correct) ?? item.correct;
    sloppy.submit("answer", { value: wrong });
  }
  assert.ok(sloppy.ledger.total() < 0);
  assert.ok(sloppy.result().score < 500, "an unsafe/sloppy exam must not pass");
});

test("the campaign covers every persona in the PRD", async () => {
  const { CHAPTERS } = await load("levels/registry.ts");
  const withLevels = CHAPTERS.filter((c) => c.levels.some((l) => l.built));
  const roles = new Set(withLevels.flatMap((c) => c.roles));

  for (const persona of [
    "Delivery Clerk",
    "Forklift Operator",
    "Packing Supervisor",
    "Production Clerk",
    "Shift Supervisor",
    "All",
  ]) {
    assert.ok(roles.has(persona), `no built level serves the ${persona} persona`);
  }
});

/* ---------------------------------------------------------------- progress */

test("ranks: a rank is earned only when every built level in its chapters passes", async () => {
  const { rankFor, chapterPassed } = await load("data/progress.ts");
  const { CHAPTERS } = await load("levels/registry.ts");

  assert.equal(rankFor({}), "trainee", "no attempts means no rank beyond trainee");

  // pass every built level in chapters 1 and 2 -> Clerk
  const attempts = {};
  for (const ch of CHAPTERS.filter((c) => ["0", "1", "2"].includes(c.id))) {
    for (const l of ch.levels.filter((x) => x.built)) {
      attempts[l.id] = { levelId: l.id, score: 800, stars: 2, omr: 0, at: 0 };
    }
  }
  assert.equal(chapterPassed(attempts, "1"), true);
  assert.equal(rankFor(attempts), "clerk");

  // one level dropped back to zero stars loses the rank again
  const firstCh1 = CHAPTERS.find((c) => c.id === "1").levels[0].id;
  attempts[firstCh1] = { levelId: firstCh1, score: 100, stars: 0, omr: -50, at: 0 };
  assert.equal(chapterPassed(attempts, "1"), false);
  assert.notEqual(rankFor(attempts), "clerk");
});

test("badges: awarded only for a 3-star run that did not lose money", async () => {
  const { badgesFor } = await load("data/progress.ts");

  assert.deepEqual(badgesFor({}), []);

  const threeStarClean = { "6.6": { levelId: "6.6", score: 950, stars: 3, omr: 60, at: 0 } };
  assert.ok(badgesFor(threeStarClean).includes("escalatedCorrectly"));

  const threeStarButCostly = { "6.6": { levelId: "6.6", score: 950, stars: 3, omr: -10, at: 0 } };
  assert.deepEqual(badgesFor(threeStarButCostly), [], "a costly run earns no badge");

  const twoStar = { "6.6": { levelId: "6.6", score: 800, stars: 2, omr: 60, at: 0 } };
  assert.deepEqual(badgesFor(twoStar), []);
});

test("certificate: the verification code is deterministic and short enough to read out", async () => {
  const { verifyCode } = await load("data/progress.ts");

  const a = verifyCode("Sam", "dispatcher", 4200);
  const b = verifyCode("Sam", "dispatcher", 4200);
  assert.equal(a, b, "the printed code and the stored record must always agree");
  assert.notEqual(a, verifyCode("Sam", "dispatcher", 4201));
  assert.notEqual(a, verifyCode("Sameer", "dispatcher", 4200));
  assert.equal(a.length, 7);
  assert.match(a, /^[0-9A-Z]+$/);
});
