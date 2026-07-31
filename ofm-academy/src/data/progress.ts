/**
 * Progress, ranks and badges.
 *
 * The PRD is explicit that real progress belongs in Firestore, not
 * localStorage (PRD 8.2). Firebase is not wired up yet - there is no project
 * or credentials - so this defines the repository seam and ships a local
 * implementation behind it. Swapping in Firestore means implementing the same
 * interface, not touching any caller.
 */

import { CHAPTERS } from "../levels/registry";

export interface Attempt {
  levelId: string;
  score: number;
  stars: 0 | 1 | 2 | 3;
  omr: number;
  /** Command-stream replay, or a reference to one. */
  replayRef?: string;
  /** Set by the caller, never by the sim - the sim has no wall clock. */
  at: number;
}

export interface Progress {
  attempts: Record<string, Attempt>;
  rank: RankId;
  badges: BadgeId[];
}

/** PRD 5.7 rank ladder. */
export type RankId =
  | "trainee"
  | "clerk"
  | "operator"
  | "dispatcher"
  | "supervisor"
  | "millMaster";

export const RANKS: { id: RankId; en: string; ar: string; requires: string[] }[] = [
  { id: "trainee", en: "Trainee", ar: "متدرب", requires: ["0"] },
  { id: "clerk", en: "Clerk", ar: "كاتب", requires: ["1", "2"] },
  { id: "operator", en: "Operator", ar: "مشغّل", requires: ["3", "4"] },
  { id: "dispatcher", en: "Dispatcher", ar: "مرسل", requires: ["5", "6"] },
  { id: "supervisor", en: "Supervisor", ar: "مشرف", requires: ["8"] },
  { id: "millMaster", en: "Mill Master", ar: "أستاذ الطاحونة", requires: ["9"] },
];

export type BadgeId =
  | "zeroOverfill"
  | "fifoPerfect"
  | "escalatedCorrectly"
  | "ghostSoHunter"
  | "ferryCaught"
  | "underBudget";

export const BADGES: { id: BadgeId; en: string; ar: string; levelId: string }[] = [
  { id: "zeroOverfill", en: "Zero-Overfill Shift", ar: "وردية بلا زيادة تعبئة", levelId: "3.3" },
  { id: "fifoPerfect", en: "FIFO Perfect", ar: "الأقدم أولاً بإتقان", levelId: "4.2" },
  { id: "escalatedCorrectly", en: "Escalated Correctly", ar: "تصعيد صحيح", levelId: "6.6" },
  { id: "ghostSoHunter", en: "Ghost SO Hunter", ar: "صائد الأمر المفقود", levelId: "1.5" },
  { id: "ferryCaught", en: "Ferry Caught", ar: "أدرك العبّارة", levelId: "6.7" },
  { id: "underBudget", en: "Under Budget", ar: "ضمن الميزانية", levelId: "9.1" },
];

/** A chapter counts as passed when every built level in it has at least 1 star. */
export function chapterPassed(attempts: Record<string, Attempt>, chapterId: string): boolean {
  const chapter = CHAPTERS.find((c) => c.id === chapterId);
  if (!chapter) return false;
  const built = chapter.levels.filter((l) => l.built);
  if (built.length === 0) return false;
  return built.every((l) => (attempts[l.id]?.stars ?? 0) >= 1);
}

/** Highest rank whose chapters are all passed. */
export function rankFor(attempts: Record<string, Attempt>): RankId {
  let earned: RankId = "trainee";
  for (const rank of RANKS) {
    if (rank.requires.every((ch) => chapterPassed(attempts, ch))) earned = rank.id;
  }
  return earned;
}

/** Badges are awarded for a clean run of the level that teaches them. */
export function badgesFor(attempts: Record<string, Attempt>): BadgeId[] {
  return BADGES.filter((b) => {
    const a = attempts[b.levelId];
    return a !== undefined && a.stars === 3 && a.omr >= 0;
  }).map((b) => b.id);
}

/* ------------------------------------------------------------------ store */

export interface ProgressRepository {
  load(): Promise<Progress>;
  save(attempt: Attempt): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "ofm.progress.v1";

function empty(): Progress {
  return { attempts: {}, rank: "trainee", badges: [] };
}

/**
 * Local implementation. Works offline and with no credentials, which is what
 * lets the app be used on a mill phone today. Firestore replaces this without
 * any caller changing.
 */
export class LocalProgressRepository implements ProgressRepository {
  async load(): Promise<Progress> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const attempts = JSON.parse(raw) as Record<string, Attempt>;
      return { attempts, rank: rankFor(attempts), badges: badgesFor(attempts) };
    } catch {
      return empty();
    }
  }

  async save(attempt: Attempt): Promise<void> {
    try {
      const raw = localStorage.getItem(KEY);
      const attempts = raw ? (JSON.parse(raw) as Record<string, Attempt>) : {};
      const prev = attempts[attempt.levelId];
      // keep the learner's best, so retrying can never lose a star
      if (!prev || attempt.score > prev.score) attempts[attempt.levelId] = attempt;
      localStorage.setItem(KEY, JSON.stringify(attempts));
    } catch {
      /* progress is best-effort locally; the mill phone may be in private mode */
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Verification code for a certificate. Deterministic from the inputs, so the
 * printed code and the stored record always agree - and short enough to read
 * aloud over a phone.
 */
export function verifyCode(learner: string, rank: RankId, score: number): string {
  const text = `${learner}|${rank}|${score}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}
