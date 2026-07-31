/**
 * Rules engine. Business rules live as DATA, not code (PRD 6.5), so Sam can
 * correct a rule without touching TypeScript - and the same rule file can
 * later drive real Smart Fleet validation. One truth, two products.
 */

export type FactValue = string | number | boolean;
export type Facts = Record<string, FactValue | undefined>;

export type Severity = "hard" | "soft" | "info";

export interface RuleViolation {
  ruleId: string;
  severity: Severity;
  costOMR: number;
  messageEn: string;
  messageAr: string;
  /** Which required field failed, for pointing the UI at the right control. */
  field: string;
  expected: FactValue | FactValue[];
  actual: FactValue | undefined;
}

export interface Rule {
  id: string;
  /** All conditions must match for the rule to apply. */
  when: Facts;
  /**
   * All requirements must hold once the rule applies. A value may be a list,
   * meaning "any of these".
   */
  require: Record<string, FactValue | FactValue[]>;
  onViolation: {
    severity: Severity;
    costOMR: number;
    messageEn: string;
    messageAr: string;
  };
}

function matches(expected: FactValue | FactValue[], actual: FactValue | undefined): boolean {
  if (actual === undefined) return false;
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

/** Does this rule apply to these facts? */
export function applies(rule: Rule, facts: Facts): boolean {
  return Object.entries(rule.when).every(([k, v]) => v === undefined || facts[k] === v);
}

/**
 * Evaluate every rule against a set of facts.
 * Returns the violations, hardest first - the UI shows the blocker before the
 * nitpick.
 */
export function evaluate(rules: readonly Rule[], facts: Facts): RuleViolation[] {
  const order: Record<Severity, number> = { hard: 0, soft: 1, info: 2 };
  const out: RuleViolation[] = [];

  for (const rule of rules) {
    if (!applies(rule, facts)) continue;
    for (const [field, expected] of Object.entries(rule.require)) {
      if (matches(expected, facts[field])) continue;
      out.push({
        ruleId: rule.id,
        severity: rule.onViolation.severity,
        costOMR: rule.onViolation.costOMR,
        messageEn: rule.onViolation.messageEn,
        messageAr: rule.onViolation.messageAr,
        field,
        expected,
        actual: facts[field],
      });
    }
  }

  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** True when nothing hard is broken - i.e. the action may proceed. */
export function isPermitted(violations: readonly RuleViolation[]): boolean {
  return !violations.some((v) => v.severity === "hard");
}

/**
 * Guard against a rule file that references a fact nobody ever supplies -
 * a silent always-passes rule is worse than no rule. Used by the content
 * self-check in dev.
 */
export function unknownFactKeys(rules: readonly Rule[], knownKeys: readonly string[]): string[] {
  const known = new Set(knownKeys);
  const missing = new Set<string>();
  for (const rule of rules) {
    for (const k of Object.keys(rule.when)) if (!known.has(k)) missing.add(k);
    for (const k of Object.keys(rule.require)) if (!known.has(k)) missing.add(k);
  }
  return [...missing].sort();
}
