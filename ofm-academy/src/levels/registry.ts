/**
 * Campaign structure (PRD 5.3). Ten chapters, fifty-three levels as the target.
 *
 * `built` is deliberately honest: the map shows the whole chain so every role
 * can see where their work sits, and unbuilt levels say so rather than
 * pretending the product is finished.
 */

import type { Strings } from "../content/strings.en";

export interface LevelEntry {
  id: string;
  /** Key into strings, so no title is hardcoded. */
  titleKey: keyof Strings & string;
  built: boolean;
}

export interface ChapterEntry {
  id: string;
  /** Key into strings.chapter. */
  key: keyof Strings["chapter"];
  /** Which personas this chapter is aimed at - every role is in the chain. */
  roles: string[];
  plannedLevels: number;
  levels: LevelEntry[];
}

export const CHAPTERS: ChapterEntry[] = [
  {
    id: "0",
    key: "ch0",
    roles: ["All"],
    plannedLevels: 3,
    levels: [{ id: "0.2", titleKey: "l0_2", built: true }],
  },
  {
    id: "1",
    key: "ch1",
    roles: ["Delivery Clerk", "Trainee"],
    plannedLevels: 5,
    levels: [
      { id: "1.1", titleKey: "l1_1", built: true },
      { id: "1.2", titleKey: "l1_2", built: true },
      { id: "1.3", titleKey: "l1_3", built: true },
      { id: "1.4", titleKey: "l1_4", built: true },
      { id: "1.5", titleKey: "l1_5", built: true },
    ],
  },
  { id: "2", key: "ch2", roles: ["Production Clerk"], plannedLevels: 5, levels: [] },
  { id: "3", key: "ch3", roles: ["Packing Supervisor"], plannedLevels: 6, levels: [] },
  { id: "4", key: "ch4", roles: ["Forklift Operator"], plannedLevels: 6, levels: [] },
  { id: "5", key: "ch5", roles: ["Delivery Clerk"], plannedLevels: 8, levels: [] },
  { id: "6", key: "ch6", roles: ["Delivery Clerk"], plannedLevels: 7, levels: [] },
  { id: "7", key: "ch7", roles: ["Delivery Clerk", "Production Clerk"], plannedLevels: 4, levels: [] },
  { id: "8", key: "ch8", roles: ["Shift Supervisor"], plannedLevels: 6, levels: [] },
  { id: "9", key: "ch9", roles: ["All"], plannedLevels: 3, levels: [] },
];

export const BUILT_LEVELS = CHAPTERS.flatMap((c) => c.levels.filter((l) => l.built));

export const TOTAL_PLANNED = CHAPTERS.reduce((n, c) => n + c.plannedLevels, 0);

export function chapterOf(levelId: string): ChapterEntry | undefined {
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === levelId));
}

export function levelEntry(levelId: string): LevelEntry | undefined {
  for (const c of CHAPTERS) {
    const l = c.levels.find((x) => x.id === levelId);
    if (l) return l;
  }
  return undefined;
}
