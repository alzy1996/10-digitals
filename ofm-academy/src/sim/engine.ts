/**
 * The simulation engine (PRD 6.1, 6.4).
 *
 * Hard rules this file exists to enforce:
 *   1. sim/ imports nothing from React, Three.js or the DOM.
 *   2. Fixed 20 Hz tick - warehouse logic does not need 60 Hz, only rendering does.
 *   3. Presentation READS state and never writes it.
 *   4. All randomness comes from the seeded Rng.
 *
 * Because of that, a run is fully described by (seed + command list), which is
 * what makes command-stream replay ~5 KB instead of a video (PRD 9.1).
 */

import { Clock, DEFAULT_MILL_TZ, type MillTimezoneConfig } from "./clock";
import { Ledger, type LedgerEntry } from "./ledger";
import { Rng } from "./rng";
import { evaluate, isPermitted, type Facts, type Rule, type RuleViolation } from "./rules";

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/** A player action. This is the only way anything enters the simulation. */
export interface Command {
  /** Tick the command was issued on. Replay re-applies it on the same tick. */
  tick: number;
  type: string;
  payload?: Record<string, unknown>;
}

/** Something the simulation says happened. Presentation listens; never writes. */
export interface SimEvent {
  tick: number;
  type: string;
  payload?: Record<string, unknown>;
}

export interface LevelDefinition<S> {
  id: string;
  /** Wall-clock ms the level is allowed to run before it auto-ends. */
  durationMs: number;
  /** Rules that apply in this level, loaded from content/rules. */
  rules: readonly Rule[];
  /** Build the starting state. Must be pure given (rng, clock). */
  init(rng: Rng, clock: Clock): S;
  /**
   * Apply one command. Return facts to evaluate against the rules, or null to
   * skip rule evaluation for this command.
   */
  apply(state: S, cmd: Command, ctx: SimContext): Facts | null;
  /** Optional per-tick advance for anything time-driven. */
  step?(state: S, ctx: SimContext): void;
  /** True once the level's objective is met. */
  isComplete(state: S): boolean;
  /** Score components, 0..1 each (PRD 5.7). */
  score(state: S, ctx: SimContext): ScoreParts;
}

export interface ScoreParts {
  accuracy: number;
  speed: number;
  cost: number;
  /** 0 if ANY unsafe act occurred - auto-fail, no partial credit. */
  safety: number;
}

export interface SimContext {
  tick: number;
  rng: Rng;
  clock: Clock;
  ledger: Ledger;
  emit(type: string, payload?: Record<string, unknown>): void;
  /** Post an OMR consequence with a reason and a content string key. */
  charge(entry: Omit<LedgerEntry, "tick">): void;
}

export interface RunResult {
  levelId: string;
  seed: number;
  ticks: number;
  elapsedMs: number;
  complete: boolean;
  score: number;
  stars: 0 | 1 | 2 | 3;
  parts: ScoreParts;
  omr: number;
  ledger: readonly LedgerEntry[];
  commands: readonly Command[];
  events: readonly SimEvent[];
}

/** PRD 5.7. safety = 0 zeroes the whole score: unsafe is an auto-fail. */
export function computeScore(parts: ScoreParts): number {
  if (parts.safety <= 0) return 0;
  return Math.round(
    parts.accuracy * 400 + parts.speed * 200 + parts.cost * 250 + parts.safety * 150,
  );
}

export function starsFor(score: number, errorFree: boolean): 0 | 1 | 2 | 3 {
  if (score >= 900 && errorFree) return 3;
  if (score >= 750) return 2;
  if (score >= 500) return 1;
  return 0;
}

export class Simulation<S> {
  readonly level: LevelDefinition<S>;
  readonly rng: Rng;
  readonly clock: Clock;
  readonly ledger = new Ledger();
  readonly seed: number;

  state: S;
  tick = 0;
  private events: SimEvent[] = [];
  private commands: Command[] = [];
  private lastViolations: RuleViolation[] = [];
  private ended = false;

  constructor(
    level: LevelDefinition<S>,
    seed: number,
    startEpochMs = 0,
    tz: MillTimezoneConfig = DEFAULT_MILL_TZ,
  ) {
    this.level = level;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.clock = new Clock(startEpochMs, tz);
    this.state = level.init(this.rng, this.clock);
  }

  private ctx(): SimContext {
    return {
      tick: this.tick,
      rng: this.rng,
      clock: this.clock,
      ledger: this.ledger,
      emit: (type, payload) => this.events.push({ tick: this.tick, type, payload }),
      charge: (entry) => {
        this.ledger.post({ ...entry, tick: this.tick });
        this.events.push({
          tick: this.tick,
          type: "ledger",
          payload: { reason: entry.reason, omr: entry.omr, messageKey: entry.messageKey },
        });
      },
    };
  }

  /**
   * Submit a player command. Returns any rule violations it triggered, so the
   * UI can show the consequence rather than the word "wrong".
   */
  submit(type: string, payload?: Record<string, unknown>): RuleViolation[] {
    if (this.ended) return [];
    const cmd: Command = { tick: this.tick, type, payload };
    this.commands.push(cmd);

    const ctx = this.ctx();
    const facts = this.level.apply(this.state, cmd, ctx);

    // A command with no facts to check still counts as progress, so the
    // completion check below must run on this path too.
    if (!facts) {
      this.lastViolations = [];
      if (this.level.isComplete(this.state)) this.ended = true;
      return [];
    }

    const violations = evaluate(this.level.rules, facts);
    this.lastViolations = violations;

    for (const v of violations) {
      if (v.costOMR === 0) continue;
      ctx.charge({
        reason: "wrong_product",
        omr: -v.costOMR,
        messageKey: `rule.${v.ruleId}`,
      });
    }
    if (violations.length > 0) {
      this.events.push({
        tick: this.tick,
        type: "violation",
        payload: { ruleIds: violations.map((v) => v.ruleId), permitted: isPermitted(violations) },
      });
    }

    // A command can be the thing that finishes the level. End here rather than
    // waiting for the next tick, so the run is over the instant it is over.
    if (this.level.isComplete(this.state)) this.ended = true;

    return violations;
  }

  /** Advance exactly one fixed tick. Never call this with a variable dt. */
  step(): void {
    if (this.ended) return;
    this.clock.advance(TICK_MS);
    this.level.step?.(this.state, this.ctx());
    this.tick += 1;
    if (this.elapsedMs() >= this.level.durationMs || this.level.isComplete(this.state)) {
      this.ended = true;
    }
  }

  /** Run n ticks. Used by tests and by replay playback. */
  run(ticks: number): void {
    for (let i = 0; i < ticks && !this.ended; i++) this.step();
  }

  elapsedMs(): number {
    return this.tick * TICK_MS;
  }

  isEnded(): boolean {
    return this.ended;
  }

  violations(): readonly RuleViolation[] {
    return this.lastViolations;
  }

  /** End the run early - the learner pressed finish, or the level was solved. */
  end(): void {
    this.ended = true;
  }

  result(): RunResult {
    const parts = this.level.score(this.state, this.ctx());
    const score = computeScore(parts);
    return {
      levelId: this.level.id,
      seed: this.seed,
      ticks: this.tick,
      elapsedMs: this.elapsedMs(),
      complete: this.level.isComplete(this.state),
      score,
      stars: starsFor(score, parts.accuracy >= 1),
      parts,
      omr: this.ledger.total(),
      ledger: this.ledger.all(),
      commands: this.commands,
      events: this.events,
    };
  }
}
