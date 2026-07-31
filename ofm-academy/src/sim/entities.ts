/**
 * Entity types (PRD 6.2). Pure data - no behaviour, no imports.
 *
 * Deliberately mirrors the OFM Smart Fleet v5.1 model so a later switch from
 * training mode to live mode is a config flag, not a rewrite (PRD 1.4).
 */

export type CargoForm = "bag" | "bulk";
export type TruckType = "flatbed" | "tipper";
export type Species = "poultry" | "dairy" | "camel" | "fish" | "other";

/** PRD 4.7: one 25 kg bag, 40 bags to the tonne. */
export const KG_PER_BAG = 25;
export const BAGS_PER_MT = 40;

export function mtToBags(mt: number): number {
  return Math.round(mt * BAGS_PER_MT);
}

export function bagsToMt(bags: number): number {
  return bags / BAGS_PER_MT;
}

export interface Product {
  id: string;
  /** Buhler code - the number the mill floor actually says out loud. */
  buhlerCode: string;
  erpCode: string | null;
  nameEn: string | null;
  nameAr: string | null;
  species: Species | null;
  form: CargoForm | "both" | null;
  bagWeightKg: number;
  premixRequired: boolean | null;
  shelfLifeDays: number | null;
  /** True while any field above is still awaiting Sam's export. */
  needsConfirm: boolean;
}

export interface Customer {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Destination town, which is what decides the route and the rate. */
  destination: string;
  /** Masirah is reached via the Shannah ferry - transit is not distance. */
  requiresFerry: boolean;
}

export interface Transporter {
  id: string;
  name: string;
  /** Contact NPC role, never a phone number - contacts are admin-only. */
  contactRole: string;
}

export interface Contract {
  transporterId: string;
  /** Matches Customer.id, or a bare destination for geographic drops. */
  route: string;
  truckType: TruckType;
  capacityMt: number[];
  rateOmr: number | null;
  /** Some routes price per MT rather than per trip. */
  perMt: boolean;
  validFrom: string;
  validTo: string;
}

export type SoStatus =
  | "created"
  | "ready"
  | "queued"
  | "loading"
  | "weighed"
  | "documented"
  | "dispatched"
  | "delivered";

export interface SalesOrder {
  id: string;
  customerId: string;
  productCode: string;
  mt: number;
  bags: number;
  /** Sim epoch ms. */
  deadline: number;
  form: CargoForm;
  status: SoStatus;
}

export type TruckStatus =
  | "booked"
  | "arrived"
  | "tare"
  | "queued"
  | "loading"
  | "gross"
  | "documented"
  | "departed";

export interface Truck {
  id: string;
  /** Omani yellow plate - recognition matters for immersion (PRD 4.9). */
  plate: string;
  type: TruckType;
  capacityMt: number;
  tareKg: number | null;
  grossKg: number | null;
  status: TruckStatus;
}

export function netKg(truck: Truck): number | null {
  if (truck.tareKg === null || truck.grossKg === null) return null;
  return truck.grossKg - truck.tareKg;
}

export interface Batch {
  id: string;
  productCode: string;
  /** Sim epoch ms - FIFO compares this, never position on the shelf. */
  producedAt: number;
  qtyMt: number;
  location: string;
}

export type DocType = "SO" | "DN" | "GatePass" | "POD";

/** PRD 4.14: Delivery signs, then Packing, then Production. Never skipped. */
export type DocStatus = "pending_packing" | "pending_production" | "completed";

export interface Signature {
  role: "delivery" | "packing" | "production";
  at: number;
  remark?: string;
}

export interface DocumentRecord {
  id: string;
  type: DocType;
  soId: string;
  status: DocStatus;
  signatures: Signature[];
}

export type Team = "A" | "B";

export interface Employee {
  id: string;
  /** Anonymised role label for any build outside Sam's own (PRD 4.3). */
  roleLabel: string;
  team: Team;
  /** The 10:00-22:00 worker, one per team. */
  isOverlap: boolean;
  onLeave: boolean;
}
