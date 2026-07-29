/**
 * Content loader. Everything that describes the real world lives in
 * content/ and is read through here - golden rule, PRD 12.
 */

import type { Rule } from "../sim/rules";
import type { Contract, Customer, Product, Transporter } from "../sim/entities";
import { en, type Strings } from "./strings.en";
import { ar } from "./strings.ar";

import productsJson from "./world/products.feed.json";
import customersJson from "./world/customers.json";
import transportersJson from "./world/transporters.json";
import contractsJson from "./world/contracts.json";
import glossaryJson from "./world/glossary.json";
import zonesJson from "./world/zones.json";
import routingRules from "./world/rules/routing.json";
import orderRules from "./world/rules/order.json";

export type Lang = "en" | "ar";

export const strings: Record<Lang, Strings> = { en, ar };

export function isRtl(lang: Lang): boolean {
  return lang === "ar";
}

export const products = productsJson.products as unknown as Product[];
export const customers = customersJson.customers as unknown as Customer[];
export const transporters = transportersJson.transporters as unknown as Transporter[];

export const contracts = contractsJson.contracts.map((c) => ({
  ...c,
  validFrom: contractsJson.validFrom,
  validTo: contractsJson.validTo,
})) as unknown as Contract[];

export const ferry = contractsJson.ferry;

export interface GlossaryTerm {
  id: string;
  en: string;
  ar: string;
  meaningEn: string;
  meaningAr: string;
}
export const glossary = glossaryJson.terms as GlossaryTerm[];

export interface Zone {
  id: string;
  nameEn: string;
  nameAr: string;
  dept: string;
  ownsEn: string;
  ownsAr: string;
}
export const zones = zonesJson.zones as Zone[];

export const rules = {
  routing: routingRules.rules as unknown as Rule[],
  order: orderRules.rules as unknown as Rule[],
  all: [...routingRules.rules, ...orderRules.rules] as unknown as Rule[],
};

/** The core codes, in PRD Appendix B order. */
export const coreCodes: string[] = products.map((p) => p.buhlerCode);

export function productByCode(code: string): Product | undefined {
  return products.find((p) => p.buhlerCode === code);
}

export function customerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

/**
 * A display label for a product. Until the Smart Fleet export lands there is
 * no confirmed name, so we show the code and nothing invented (PRD 0.3).
 */
export function productLabel(p: Product, lang: Lang): string {
  const name = lang === "ar" ? p.nameAr : p.nameEn;
  return name ?? p.buhlerCode;
}

/** True when a product still has unconfirmed fields - drives the badge. */
export function needsConfirm(p: Product): boolean {
  return p.needsConfirm;
}

/**
 * Contracts serving a route, matched by customer id or by bare destination
 * for the geographic drops.
 */
export function contractsFor(customer: Customer): Contract[] {
  return contracts.filter((c) => c.route === customer.id || c.route === customer.destination);
}

/** Interpolate {name} placeholders. Keeps components free of string surgery. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in params ? String(params[k]) : m,
  );
}
