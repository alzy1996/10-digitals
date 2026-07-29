/**
 * UI state only. Simulation state lives in the sim and never comes here
 * (PRD 6.1 rule 5).
 *
 * Language and theme are UI preferences, so localStorage is allowed for them.
 * Real progress is NOT kept here - that belongs in Firestore (PRD 8.2).
 */

import { create } from "zustand";
import type { Lang } from "../content";

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
  | { name: "level"; levelId: string };

interface UiState {
  lang: Lang;
  route: Route;
  /** Local session results, keyed by level id. Firestore is the real store. */
  best: Record<string, { score: number; stars: number }>;
  setLang(lang: Lang): void;
  toggleLang(): void;
  go(route: Route): void;
  recordResult(levelId: string, score: number, stars: number): void;
}

export const useUi = create<UiState>((set) => ({
  lang: initialLang(),
  route: { name: "home" },
  best: {},

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

  recordResult(levelId, score, stars) {
    set((s) => {
      const prev = s.best[levelId];
      if (prev && prev.score >= score) return s;
      return { best: { ...s.best, [levelId]: { score, stars } } };
    });
  },
}));
