/**
 * Command-stream replay (PRD 9.1) - the flagship feature.
 *
 * The simulation is deterministic, so a run is fully described by its seed
 * plus the player's commands. We record those, not video: roughly 5 KB for a
 * full shift, which makes thousands of replays effectively free on the
 * Firebase free tier.
 *
 * That one property buys, for nothing extra:
 *   - Mistake Replay: watch your own shift back with the failing tick marked
 *   - Ghost of the Expert: race a senior's recorded run
 *   - Trainer review: see the actual decisions, not just a score
 *   - Incident Court: rebuild a real incident as a replayable scenario
 */

import type { Command, LevelDefinition, RunResult } from "../sim/engine";
import { Simulation } from "../sim/engine";
import type { MillTimezoneConfig } from "../sim/clock";

/** Bump when the sim's behaviour changes, so old replays are not misread. */
export const REPLAY_VERSION = 1;

export interface Replay {
  version: number;
  levelId: string;
  seed: number;
  startEpochMs: number;
  tz: MillTimezoneConfig;
  /** Total ticks the original run lasted. */
  ticks: number;
  commands: Command[];
}

export function recordFrom(
  result: RunResult,
  startEpochMs: number,
  tz: MillTimezoneConfig,
): Replay {
  return {
    version: REPLAY_VERSION,
    levelId: result.levelId,
    seed: result.seed,
    startEpochMs,
    tz,
    ticks: result.ticks,
    commands: result.commands.slice(),
  };
}

/**
 * Re-run a replay to completion and return the result.
 *
 * If the sim is genuinely deterministic this reproduces the original run
 * exactly - which is also how we test that it is. Any drift here means
 * something in sim/ reached for Math.random(), Date.now(), or mutable
 * module state.
 */
export function playback<S>(level: LevelDefinition<S>, replay: Replay): RunResult {
  if (replay.version !== REPLAY_VERSION) {
    throw new Error(
      `Replay version ${replay.version} cannot be played by engine version ${REPLAY_VERSION}`,
    );
  }
  if (replay.levelId !== level.id) {
    throw new Error(`Replay is for level ${replay.levelId}, not ${level.id}`);
  }

  const sim = new Simulation(level, replay.seed, replay.startEpochMs, replay.tz);

  // commands are grouped by the tick they were issued on
  const byTick = new Map<number, Command[]>();
  for (const cmd of replay.commands) {
    const list = byTick.get(cmd.tick) ?? [];
    list.push(cmd);
    byTick.set(cmd.tick, list);
  }

  for (let t = 0; t <= replay.ticks && !sim.isEnded(); t++) {
    for (const cmd of byTick.get(t) ?? []) {
      sim.submit(cmd.type, cmd.payload);
    }
    sim.step();
  }

  return sim.result();
}

/** Roughly what this replay costs in Firestore, for the quota budget. */
export function approxBytes(replay: Replay): number {
  return JSON.stringify(replay).length;
}

/**
 * Step a replay one command at a time, for the Mistake Replay scrubber.
 * Yields the sim after each command so the UI can draw the state at that tick.
 */
export function* scrub<S>(
  level: LevelDefinition<S>,
  replay: Replay,
): Generator<{ tick: number; sim: Simulation<S> }> {
  const sim = new Simulation(level, replay.seed, replay.startEpochMs, replay.tz);
  const byTick = new Map<number, Command[]>();
  for (const cmd of replay.commands) {
    const list = byTick.get(cmd.tick) ?? [];
    list.push(cmd);
    byTick.set(cmd.tick, list);
  }

  for (let t = 0; t <= replay.ticks && !sim.isEnded(); t++) {
    const cmds = byTick.get(t);
    if (cmds) {
      for (const cmd of cmds) sim.submit(cmd.type, cmd.payload);
      yield { tick: t, sim };
    }
    sim.step();
  }
}
