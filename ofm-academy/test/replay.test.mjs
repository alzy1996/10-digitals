/**
 * Replay determinism, end to end through real levels.
 *
 * This is the test that protects the flagship feature: if a recorded command
 * stream does not reproduce the original run exactly, then Mistake Replay,
 * Ghost of the Expert and trainer review are all quietly wrong.
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { load } from "./_load.mjs";

/** Play a level with a fixed script of commands, ticking between each. */
function runScripted(Simulation, def, seed, script) {
  const sim = new Simulation(def, seed, 0);
  for (const step of script) {
    if (sim.isEnded()) break;
    sim.submit(step.type, step.payload);
    for (let i = 0; i < 4; i++) sim.step();
  }
  sim.end();
  return sim.result();
}

test("level init is a pure function of the seed", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_2_CodeBreaker } = await load("levels/defs.ts");

  const a = new Simulation(L1_2_CodeBreaker, 4242, 0);
  const b = new Simulation(L1_2_CodeBreaker, 4242, 0);
  assert.deepEqual(a.state.rounds, b.state.rounds);

  const c = new Simulation(L1_2_CodeBreaker, 4243, 0);
  assert.notDeepEqual(a.state.rounds, c.state.rounds);
});

test("code breaker: a correct run scores clean and costs nothing", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_2_CodeBreaker } = await load("levels/defs.ts");

  const sim = new Simulation(L1_2_CodeBreaker, 777, 0);
  const answers = sim.state.rounds.map((r) => r.asked);
  for (const code of answers) {
    sim.submit("choose", { code });
    sim.step();
  }
  const res = sim.result();
  assert.equal(res.parts.accuracy, 1);
  assert.equal(res.omr, 0, "a clean run must not cost the learner anything");
  assert.ok(res.score >= 750, `expected a strong score, got ${res.score}`);
});

test("code breaker: a wrong code charges the ledger and explains itself", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_2_CodeBreaker } = await load("levels/defs.ts");

  const sim = new Simulation(L1_2_CodeBreaker, 555, 0);
  const round = sim.state.rounds[0];
  const wrong = round.choices.find((c) => c !== round.asked);
  const violations = sim.submit("choose", { code: wrong });

  assert.ok(violations.length > 0, "picking the wrong code must raise a rule violation");
  assert.equal(violations[0].ruleId, "R-PRODUCT-01");
  assert.ok(violations[0].messageEn.length > 0);
  assert.ok(violations[0].messageAr.length > 0, "Arabic consequence text is not optional");
  assert.ok(sim.ledger.total() < 0, "the mistake must cost OMR, not just say 'wrong'");
});

test("replay reproduces the original run exactly", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { recordFrom, playback, approxBytes } = await load("replay/recorder.ts");
  const { DEFAULT_MILL_TZ } = await load("sim/clock.ts");
  const { L1_2_CodeBreaker } = await load("levels/defs.ts");

  // a deliberately messy run: some right, some wrong
  const probe = new Simulation(L1_2_CodeBreaker, 31337, 0);
  const script = probe.state.rounds.map((r, i) => ({
    type: "choose",
    payload: { code: i % 3 === 0 ? r.choices.find((c) => c !== r.asked) : r.asked },
  }));

  const original = runScripted(Simulation, L1_2_CodeBreaker, 31337, script);
  const replay = recordFrom(original, 0, DEFAULT_MILL_TZ);
  const again = playback(L1_2_CodeBreaker, replay);

  assert.equal(again.score, original.score, "score drifted on replay");
  assert.equal(again.omr, original.omr, "ledger drifted on replay");
  assert.deepEqual(again.parts, original.parts);
  assert.equal(again.ledger.length, original.ledger.length);

  // the whole point: a full run is kilobytes, not a video
  assert.ok(approxBytes(replay) < 5000, `replay too big: ${approxBytes(replay)} bytes`);
});

test("replay refuses a mismatched level or version", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { recordFrom, playback } = await load("replay/recorder.ts");
  const { DEFAULT_MILL_TZ } = await load("sim/clock.ts");
  const { L1_2_CodeBreaker, L1_3_MtToBags } = await load("levels/defs.ts");

  const sim = new Simulation(L1_2_CodeBreaker, 8, 0);
  sim.end();
  const replay = recordFrom(sim.result(), 0, DEFAULT_MILL_TZ);

  assert.throws(() => playback(L1_3_MtToBags, replay), /not 1\.3/);
  assert.throws(
    () => playback(L1_2_CodeBreaker, { ...replay, version: 999 }),
    /version/,
  );
});

test("ghost SO: reporting the bug earns, it is the correct answer", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_5_GhostSo } = await load("levels/defs.ts");

  const sim = new Simulation(L1_5_GhostSo, 2024, 0);
  const missing = sim.state.missingId;

  assert.equal(sim.state.list.length, 7);
  assert.equal(sim.state.inbox.length, 8);
  assert.ok(!sim.state.list.includes(missing), "the missing SO must not be in the list");

  sim.submit("guess", { id: missing });
  sim.submit("report");

  assert.equal(sim.state.reported, true);
  assert.ok(sim.ledger.total() > 0, "escalating correctly is rewarded, not punished");
  assert.equal(sim.isEnded(), true);
});

test("MT to bags: a correct sheet is worth full accuracy", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_3_MtToBags } = await load("levels/defs.ts");

  const sim = new Simulation(L1_3_MtToBags, 606, 0);
  while (!sim.isEnded()) {
    const q = sim.state.questions[sim.state.index];
    if (!q) break;
    sim.submit("answer", { value: q.toBags ? q.mt * 40 : q.mt });
    sim.step();
  }
  const res = sim.result();
  assert.equal(res.parts.accuracy, 1);
  assert.equal(sim.state.errors, 0);
});

test("deadline: the ferry order is sequenced by slack, not by distance", async () => {
  const { Simulation } = await load("sim/engine.ts");
  const { L1_4_Deadline } = await load("levels/defs.ts");

  const sim = new Simulation(L1_4_Deadline, 4004, 0);
  const correct = sim.state.correctOrder;

  // committing the intended order is a clean pass
  sim.submit("commit", { order: correct });
  const res = sim.result();
  assert.equal(res.parts.accuracy, 1);
  assert.equal(res.omr, 0);

  // and a reversed order costs money
  const sim2 = new Simulation(L1_4_Deadline, 4004, 0);
  sim2.submit("commit", { order: correct.slice().reverse() });
  assert.ok(sim2.ledger.total() < 0, "a bad queue must cost OMR");
});

test("every rule file carries both languages and a real cost or an explicit zero", async () => {
  const { rules } = await load("content/index.ts");
  assert.ok(rules.all.length >= 9, `expected the authored rules, got ${rules.all.length}`);
  for (const r of rules.all) {
    assert.ok(r.id, "rule needs an id");
    assert.ok(r.onViolation.messageEn.trim().length > 10, `${r.id} has no English message`);
    assert.ok(r.onViolation.messageAr.trim().length > 10, `${r.id} has no Arabic message`);
    assert.ok(
      ["hard", "soft", "info"].includes(r.onViolation.severity),
      `${r.id} has an unknown severity`,
    );
    assert.ok(typeof r.onViolation.costOMR === "number", `${r.id} has no cost`);
    assert.ok(Object.keys(r.require).length > 0, `${r.id} requires nothing - it can never fire`);
  }
});

test("content: Arabic covers every English string", async () => {
  const { en } = await load("content/strings.en.ts");
  const { ar } = await load("content/strings.ar.ts");

  const walk = (a, b, path = "") => {
    for (const key of Object.keys(a)) {
      const p = path ? `${path}.${key}` : key;
      assert.ok(key in b, `missing Arabic for ${p}`);
      if (typeof a[key] === "object") walk(a[key], b[key], p);
      else {
        assert.equal(typeof b[key], "string", `${p} is not a string in Arabic`);
        assert.ok(b[key].trim().length > 0, `${p} is empty in Arabic`);
      }
    }
  };
  walk(en, ar);
});

test("content: no product name is invented while the export is outstanding", async () => {
  const { products } = await load("content/index.ts");
  assert.equal(products.length, 16, "the 16 core Buhler codes");
  for (const p of products) {
    assert.ok(/^\d{3}$/.test(p.buhlerCode), `bad code ${p.buhlerCode}`);
    if (p.needsConfirm) {
      assert.equal(p.nameEn, null, `${p.buhlerCode} has an invented English name`);
      assert.equal(p.nameAr, null, `${p.buhlerCode} has an invented Arabic name`);
      assert.equal(p.erpCode, null, `${p.buhlerCode} has an invented ERP code`);
    }
  }
});

test("content: no phone numbers ship in client data", async () => {
  const { transporters } = await load("content/index.ts");
  const blob = JSON.stringify(transporters);
  assert.ok(!/\+?\d[\d\s-]{7,}/.test(blob), "a phone-number-shaped string reached client JSON");
});
