/**
 * Dual clock: Oman local time, and the mill's production-day boundary.
 *
 * PRD 4.13 - Buhler (the mill control system) runs on Germany time, so the
 * production day does NOT roll over at Oman midnight. A load posted at 01:30
 * Oman files under the PREVIOUS production day, shift totals stop matching,
 * and the daily report is wrong. This is the single least-documented piece of
 * knowledge in the department, so it is modelled explicitly rather than
 * hand-waved.
 *
 * The exact offset behaviour (fixed vs DST-shifting) is TODO_CONFIRM - see
 * PRD 14 Q5. Everything here reads it from config so confirming it is a
 * one-line change, never a rewrite.
 */

export const OMAN_UTC_OFFSET_HOURS = 4; // Asia/Muscat, no DST

export interface MillTimezoneConfig {
  /** Mill/Buhler offset from UTC, in hours. CET = +1, CEST = +2. */
  millUtcOffsetHours: number;
  /**
   * Whether the mill offset follows European DST. Unconfirmed: the game ships
   * with the fixed-offset reading and flags it.
   */
  followsEuropeanDst: boolean;
}

/** Default until Sam confirms. Surfaced in the UI with a TODO_CONFIRM badge. */
export const DEFAULT_MILL_TZ: MillTimezoneConfig = {
  millUtcOffsetHours: 1,
  followsEuropeanDst: false,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface ClockReading {
  /** Milliseconds since the epoch. */
  epochMs: number;
  /** Oman local wall clock. */
  omanHour: number;
  omanMinute: number;
  /** Oman calendar day, as days since epoch. */
  omanDay: number;
  /**
   * The production day this instant files under. When it differs from
   * omanDay, the learner is inside the ghost hour.
   */
  productionDay: number;
  /** True when the two disagree - the trap is live. */
  inGhostHour: boolean;
  /** Hours until the next production-day rollover. */
  hoursToProductionRollover: number;
}

export class Clock {
  private epochMs: number;
  readonly tz: MillTimezoneConfig;

  constructor(startEpochMs: number, tz: MillTimezoneConfig = DEFAULT_MILL_TZ) {
    this.epochMs = startEpochMs;
    this.tz = tz;
  }

  /** Advance by simulated milliseconds. */
  advance(ms: number): void {
    this.epochMs += ms;
  }

  now(): number {
    return this.epochMs;
  }

  /**
   * The Oman-local hour at which the production day rolls over.
   * Germany midnight expressed in Oman time: 00:00 CET = 03:00 in Muscat.
   */
  rolloverHourOmanLocal(): number {
    const diff = OMAN_UTC_OFFSET_HOURS - this.tz.millUtcOffsetHours;
    return ((diff % 24) + 24) % 24;
  }

  read(): ClockReading {
    const omanMs = this.epochMs + OMAN_UTC_OFFSET_HOURS * HOUR_MS;
    const millMs = this.epochMs + this.tz.millUtcOffsetHours * HOUR_MS;

    const omanDay = Math.floor(omanMs / DAY_MS);
    const productionDay = Math.floor(millMs / DAY_MS);

    const omanTimeOfDay = omanMs - omanDay * DAY_MS;
    const omanHour = Math.floor(omanTimeOfDay / HOUR_MS);
    const omanMinute = Math.floor((omanTimeOfDay % HOUR_MS) / 60_000);

    const millTimeOfDay = millMs - productionDay * DAY_MS;
    const hoursToProductionRollover = (DAY_MS - millTimeOfDay) / HOUR_MS;

    return {
      epochMs: this.epochMs,
      omanHour,
      omanMinute,
      omanDay,
      productionDay,
      inGhostHour: productionDay !== omanDay,
      hoursToProductionRollover,
    };
  }
}

/** "06:00" style formatting, always two digits, never locale-dependent. */
export function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Build an epoch timestamp from an Oman-local wall-clock time on a given day.
 * Used by level authors to say "the truck arrives at 01:30" without doing
 * timezone arithmetic by hand.
 */
export function omanLocal(dayIndex: number, hour: number, minute = 0): number {
  return dayIndex * DAY_MS + hour * HOUR_MS + minute * 60_000 - OMAN_UTC_OFFSET_HOURS * HOUR_MS;
}
