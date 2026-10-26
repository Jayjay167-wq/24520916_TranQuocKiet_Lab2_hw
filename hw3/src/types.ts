/**
 * Domain types for the Flash-Sale engine (Task 3.1 – types only, no logic).
 *
 * Conventions:
 *  - Money is an integer amount of Vietnamese dong (VND); VND has no minor unit.
 *  - Every timestamp is epoch milliseconds, the same unit as Date.now(), so it
 *    can be compared directly with the clock used by the anti-drift timer.
 */

/** A product offered in the flash sale. */
export interface Product {
  id: string;
  name: string;
  /** Regular price in VND. */
  originalPrice: number;
  /** Flash-sale price in VND. */
  salePrice: number;
}

/**
 * Lifecycle of an inventory item (finite state machine, built in Task 3.3):
 *   available -> reserved -> available (hold expired / cancelled)
 *                         -> available | sold_out (checkout completed)
 */
export type InventoryStatus = "available" | "reserved" | "sold_out";

/** Stock record for one product. */
export interface InventoryItem {
  id: string;
  productId: Product["id"];
  /** Units that can still be bought. */
  stock: number;
  status: InventoryStatus;
  /**
   * Optimistic-lock counter: incremented on every successful update, so a
   * writer holding a stale version can be detected and rejected.
   */
  version: number;
  /** Buyer holding the reservation. Set only while status is "reserved". */
  reservedBy?: string;
  /** When the hold expires (epoch ms). Set only while status is "reserved". */
  reservedUntil?: number;
}

export type ReservationStatus =
  | "active" // hold is in place, counting down
  | "expired" // lock timed out before checkout
  | "completed" // checkout succeeded
  | "cancelled"; // buyer released the hold

/** A buyer's time-limited hold on units of an inventory item. */
export interface Reservation {
  id: string;
  inventoryItemId: InventoryItem["id"];
  productId: Product["id"];
  /** Buyer who owns the hold. */
  userId: string;
  quantity: number;
  status: ReservationStatus;
  /** Epoch ms when the hold was created. */
  createdAt: number;
  /** Epoch ms when the hold lapses if checkout has not happened. */
  expiresAt: number;
  /** Epoch ms when checkout finished. Set only when status is "completed". */
  completedAt?: number;
}

/** Static definition of one flash sale: what is sold, how much, and when. */
export interface SaleScenario {
  id: string;
  name: string;
  description: string;
  /** IANA time zone the sale times are expressed in. */
  timeZone: string;
  /** Sale opens (epoch ms). */
  startsAt: number;
  /** Sale closes (epoch ms). */
  endsAt: number;
  /** How long a reservation holds stock before it expires. */
  reservationTtlMs: number;
  products: readonly Product[];
  /** STARTING inventory. Logic must copy it, never mutate it in place. */
  initialInventory: readonly InventoryItem[];
}
