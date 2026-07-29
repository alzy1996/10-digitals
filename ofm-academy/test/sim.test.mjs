/**
 * Tests for the properties everything else depends on.
 *
 * If determinism breaks, replay, grading and ghost races all break silently -
 * so it is tested directly rather than assumed.
 *
 * Run with: npm test
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { load } from "./_load.mjs";

test("Rng: same seed reproduces the same stream", async () => {
  const { Rng } = await load("sim/rng.ts");
  const a = new Rng(12345);
  const b = new Rng(12345);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test("Rng: different seeds diverge", async () => {
  const { Rng } = await load("sim/rng.ts");
  const a = new Rng(1);
  const b = new Rng(2);
  assert.notEqual(a.next(), b.next());
});

test("Rng: int stays in range, inclusive both ends", async () => {
  const { Rng } = await load("sim/rng.ts");
  const r = new Rng(99);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(1, 4);
    assert.ok(v >= 1 && v <= 4, `out of range: ${v}`);
    assert.ok(Number.isInteger(v));
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test("Rng: shuffle keeps every element", async () => {
  const { Rng } = await load("sim/rng.ts");
  const r = new Rng(7);
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = r.shuffle(input);
  assert.deepEqual(out.slice().sort((x, y) => x - y), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8], "shuffle must not mutate its input");
});

test("Clock: the Buhler day boundary is not Oman midnight", async () => {
  const { Clock, omanLocal, DEFAULT_MILL_TZ } = await load("sim/clock.ts");

  // 01:30 Oman on day 10 - the exact case from PRD 4.13
  const clock = new Clock(omanLocal(10, 1, 30), DEFAULT_MILL_TZ);
  const r = clock.read();

  assert.equal(r.omanHour, 1);
  assert.equal(r.omanMinute, 30);
  assert.equal(r.omanDay, 10, "Oman calendar day is the 10th");
  assert.equal(r.productionDay, 9, "but the mill files it under the previous production day");
  assert.equal(r.inGhostHour, true);
});

test("Clock: after the rollover both agree again", async () => {
  const { Clock, omanLocal, DEFAULT_MILL_TZ } = await load("sim/clock.ts");
  // rollover is 03:00 Oman for a CET mill, so 04:00 is safely past it
  const clock = new Clock(omanLocal(10, 4, 0), DEFAULT_MILL_TZ);
  const r = clock.read();
  assert.equal(r.inGhostHour, false);
  assert.equal(r.productionDay, r.omanDay);
});

test("Clock: rollover hour is derived from the offset, not hardcoded", async () => {
  const { Clock } = await load("sim/clock.ts");
  const cet = new Clock(0, { millUtcOffsetHours: 1, followsEuropeanDst: false });
  assert.equal(cet.rolloverHourOmanLocal(), 3, "00:00 CET is 03:00 in Muscat");
  const cest = new Clock(0, { millUtcOffsetHours: 2, followsEuropeanDst: true });
  assert.equal(cest.rolloverHourOmanLocal(), 2, "00:00 CEST is 02:00 in Muscat");
});

test("entities: MT and bags convert by 40", async () => {
  const { mtToBags, bagsToMt, BAGS_PER_MT, KG_PER_BAG } = await load("sim/entities.ts");
  assert.equal(BAGS_PER_MT, 40);
  assert.equal(KG_PER_BAG, 25);
  assert.equal(mtToBags(25), 1000, "25 MT is 1,000 bags - the truck-scale number");
  assert.equal(mtToBags(35), 1400);
  assert.equal(bagsToMt(1000), 25);
});

test("rules: bagged cargo on a tipper is a hard violation", async () => {
  const { evaluate, isPermitted } = await load("sim/rules.ts");
  const rule = {
    id: "R-TRUCKTYPE-01",
    when: { cargoForm: "bag" },
    require: { truckType: "flatbed" },
    onViolation: { severity: "hard", costOMR: 90, messageEn: "no", messageAr: "لا" },
  };
  const bad = evaluate([rule], { cargoForm: "bag", truckType: "tipper" });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].ruleId, "R-TRUCKTYPE-01");
  assert.equal(isPermitted(bad), false);

  const good = evaluate([rule], { cargoForm: "bag", truckType: "flatbed" });
  assert.equal(good.length, 0);
  assert.equal(isPermitted(good), true);
});

test("rules: a rule does not fire when its `when` does not match", async () => {
  const { evaluate } = await load("sim/rules.ts");
  const rule = {
    id: "R-X",
    when: { cargoForm: "bag" },
    require: { truckType: "flatbed" },
    onViolation: { severity: "hard", costOMR: 1, messageEn: "", messageAr: "" },
  };
  assert.equal(evaluate([rule], { cargoForm: "bulk", truckType: "tipper" }).length, 0);
});

test("rules: hard violations sort before soft ones", async () => {
  const { evaluate } = await load("sim/rules.ts");
  const soft = {
    id: "SOFT",
    when: {},
    require: { a: true },
    onViolation: { severity: "soft", costOMR: 1, messageEn: "", messageAr: "" },
  };
  const hard = {
    id: "HARD",
    when: {},
    require: { b: true },
    onViolation: { severity: "hard", costOMR: 1, messageEn: "", messageAr: "" },
  };
  const out = evaluate([soft, hard], { a: false, b: false });
  assert.equal(out[0].ruleId, "HARD");
});

test("rules: a missing fact counts as a violation, never a silent pass", async () => {
  const { evaluate } = await load("sim/rules.ts");
  const rule = {
    id: "R-Y",
    when: {},
    require: { mustExist: true },
    onViolation: { severity: "hard", costOMR: 5, messageEn: "", messageAr: "" },
  };
  assert.equal(evaluate([rule], {}).length, 1);
});

test("ledger: totals, losses and grouping", async () => {
  const { Ledger } = await load("sim/ledger.ts");
  const l = new Ledger();
  l.post({ tick: 1, reason: "fifo_breach", omr: -25, messageKey: "a" });
  l.post({ tick: 2, reason: "fifo_breach", omr: -25, messageKey: "a" });
  l.post({ tick: 3, reason: "correct_call", omr: 80, messageKey: "b" });
  assert.equal(l.total(), 30);
  assert.equal(l.lost(), 50);
  assert.equal(l.earned(), 80);
  const grouped = l.byReason();
  assert.equal(grouped[0].reason, "fifo_breach", "biggest drain first");
  assert.equal(grouped[0].count, 2);
});

test("score: an unsafe act zeroes the whole score", async () => {
  const { computeScore, starsFor } = await load("sim/engine.ts");
  const perfectButUnsafe = { accuracy: 1, speed: 1, cost: 1, safety: 0 };
  assert.equal(computeScore(perfectButUnsafe), 0);

  const clean = { accuracy: 1, speed: 1, cost: 1, safety: 1 };
  assert.equal(computeScore(clean), 1000);
  assert.equal(starsFor(1000, true), 3);
  assert.equal(starsFor(1000, false), 2, "3 stars needs zero errors too");
  assert.equal(starsFor(760, true), 2);
  assert.equal(starsFor(520, true), 1);
  assert.equal(starsFor(400, true), 0);
});
