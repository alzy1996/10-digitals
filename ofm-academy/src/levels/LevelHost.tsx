/**
 * Runs a level: owns the Simulation, drives the fixed 20 Hz tick, and hands
 * the view a read-only state plus a submit() for commands.
 *
 * The view never mutates sim state. That discipline is what keeps the replay
 * honest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Simulation, TICK_MS, type RunResult } from "../sim/engine";
import type { RuleViolation } from "../sim/rules";
import { seedFrom } from "../sim/rng";
import { DEFAULT_MILL_TZ } from "../sim/clock";
import { approxBytes, recordFrom, playback, type Replay } from "../replay/recorder";
import { LEVEL_DEFS } from "./defs";

export interface LevelApi<S> {
  state: S;
  submit(type: string, payload?: Record<string, unknown>): RuleViolation[];
  violations: readonly RuleViolation[];
  omr: number;
  elapsedMs: number;
  finish(): void;
}

export interface FinishedRun {
  result: RunResult;
  replay: Replay;
  replayBytes: number;
  /** Playback reproduced the run exactly - proof the sim stayed deterministic. */
  replayVerified: boolean;
}

export function useLevel<S>(levelId: string, seedText: string) {
  const def = LEVEL_DEFS[levelId];
  if (!def) throw new Error(`Unknown level ${levelId}`);

  const seed = useMemo(() => seedFrom(`${levelId}:${seedText}`), [levelId, seedText]);
  const simRef = useRef<Simulation<S> | null>(null);
  if (simRef.current === null) {
    simRef.current = new Simulation<S>(def, seed, 0, DEFAULT_MILL_TZ);
  }

  const [, forceRender] = useState(0);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const bump = useCallback(() => forceRender((n) => n + 1), []);

  const settle = useCallback(() => {
    const sim = simRef.current!;
    if (!sim.isEnded() || finished) return;
    const result = sim.result();
    const replay = recordFrom(result, 0, DEFAULT_MILL_TZ);

    // Re-run the recorded commands. If this diverges, something in sim/
    // reached for wall-clock time or unseeded randomness.
    let replayVerified = false;
    try {
      const again = playback(def, replay);
      replayVerified = again.score === result.score && again.omr === result.omr;
    } catch {
      replayVerified = false;
    }

    setFinished({ result, replay, replayBytes: approxBytes(replay), replayVerified });
  }, [def, finished]);

  // fixed-timestep loop: accumulate real time, consume it in whole ticks
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const loop = (now: number) => {
      const sim = simRef.current!;
      if (!sim.isEnded()) {
        acc += now - last;
        last = now;
        let stepped = false;
        // cap the catch-up so a backgrounded tab cannot fast-forward a shift
        acc = Math.min(acc, TICK_MS * 10);
        while (acc >= TICK_MS) {
          sim.step();
          acc -= TICK_MS;
          stepped = true;
        }
        if (stepped) bump();
        if (sim.isEnded()) settle();
      } else {
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bump, settle]);

  const submit = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      const sim = simRef.current!;
      const v = sim.submit(type, payload);
      bump();
      if (sim.isEnded()) settle();
      return v;
    },
    [bump, settle],
  );

  const finish = useCallback(() => {
    simRef.current!.end();
    settle();
    bump();
  }, [bump, settle]);

  const sim = simRef.current!;
  const api: LevelApi<S> = {
    state: sim.state,
    submit,
    violations: sim.violations(),
    omr: sim.ledger.total(),
    elapsedMs: sim.elapsedMs(),
    finish,
  };

  return { api, finished, def };
}
