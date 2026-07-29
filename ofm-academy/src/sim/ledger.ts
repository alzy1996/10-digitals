/**
 * The OMR ledger. Money is the score (PRD 5.1 pillar 3), so every consequence
 * lands here with a reason attached - a number with no story teaches nothing.
 */

export type LedgerReason =
  | "wrong_product"
  | "wrong_truck_type"
  | "out_of_scope_route"
  | "no_contract_escalated"
  | "fifo_breach"
  | "stock_written_off"
  | "overfill"
  | "idle_labour"
  | "truck_waiting"
  | "missing_document"
  | "deadline_missed"
  | "ferry_missed"
  | "day_boundary_misposted"
  | "unsafe_act"
  | "correct_call"
  | "on_time_delivery"
  | "under_budget";

export interface LedgerEntry {
  /** Sim tick the entry was posted on, so a replay can scrub to it. */
  tick: number;
  reason: LedgerReason;
  /** Negative costs money, positive earns it. */
  omr: number;
  /** Key into content strings - never a hardcoded sentence. */
  messageKey: string;
  /** Values interpolated into that string. */
  params?: Record<string, string | number>;
}

export class Ledger {
  private entries: LedgerEntry[] = [];

  post(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  /** Net OMR. Can go negative - a bad shift costs real money. */
  total(): number {
    return this.entries.reduce((sum, e) => sum + e.omr, 0);
  }

  /** Money lost only, as a positive number. */
  lost(): number {
    return -this.entries.filter((e) => e.omr < 0).reduce((s, e) => s + e.omr, 0);
  }

  /** Money earned or saved. */
  earned(): number {
    return this.entries.filter((e) => e.omr > 0).reduce((s, e) => s + e.omr, 0);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /** Grouped by reason, biggest drain first - drives the shift report. */
  byReason(): { reason: LedgerReason; omr: number; count: number }[] {
    const map = new Map<LedgerReason, { omr: number; count: number }>();
    for (const e of this.entries) {
      const cur = map.get(e.reason) ?? { omr: 0, count: 0 };
      cur.omr += e.omr;
      cur.count += 1;
      map.set(e.reason, cur);
    }
    return [...map.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => a.omr - b.omr);
  }

  clear(): void {
    this.entries = [];
  }
}
