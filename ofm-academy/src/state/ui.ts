/**
 * UI state only. Simulation state lives in the sim and never comes here
 * (PRD 6.1 rule 5).
 *
 * Language and theme are UI preferences, so localStorage is allowed for them.
 * Real progress is NOT kept here - that belongs in Firestore (PRD 8.2).
 */

import { create } from "zustand";
import type { Lang } from "../content";
import {
  LocalProgressRepository,
  badgesFor,
  rankFor,
  type Attempt,
  type BadgeId,
  type RankId,
} from "../data/progress";

const repo = new LocalProgressRepository();

const LANG_KEY = "ofm.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "ar") return saved;
    return navigator.language?.startsWith("ar") ? "ar" : "en";
  } catch {
    return "en";
  }
}

export type Route =
  | { name: "home" }
  | { name: "chapter"; chapterId: string }
  | { name: "level"; levelId: string }
  | { name: "certificate" };

interface UiState {
  lang: Lang;
  route: Route;
  /** Best attempt per level, mirrored from the progress repository. */
  best: Record<string, Attempt>;
  rank: RankId;
  badges: BadgeId[];
  setLang(lang: Lang): void;
  toggleLang(): void;
  go(route: Route): void;
  recordResult(levelId: string, score: number, stars: 0 | 1 | 2 | 3, omr: number): void;
  hydrate(): void;
  resetProgress(): void;
}

export const useUi = create<UiState>((set) => ({
  lang: initialLang(),
  route: { name: "home" },
  best: {},
  rank: "trainee",
  badges: [],

  setLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* preferences are best-effort; never block the shift on storage */
    }
    set({ lang });
  },

  toggleLang() {
    set((s) => {
      const next: Lang = s.lang === "en" ? "ar" : "en";
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        /* ignore */
      }
      return { lang: next };
    });
  },

  go(route) {
    set({ route });
  },

  recordResult(levelId, score, stars, omr) {
    // the sim has no wall clock by design, so the timestamp is stamped here
    const attempt: Attempt = { levelId, score, stars, omr, at: Date.now() };
    void repo.save(attempt);
    set((s) => {
      const prev = s.best[levelId];
      const best = prev && prev.score >= score ? s.best : { ...s.best, [levelId]: attempt };
      return { best, rank: rankFor(best), badges: badgesFor(best) };
    });
  },

  hydrate() {
    void repo.load().then((p) => {
      set({ best: p.attempts, rank: p.rank, badges: p.badges });
    });
  },

  resetProgress() {
    void repo.clear();
    set({ best: {}, rank: "trainee", badges: [] });
  },
}));
