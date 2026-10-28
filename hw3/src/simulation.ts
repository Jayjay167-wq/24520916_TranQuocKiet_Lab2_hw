import {
  InsufficientStockError,
  InvalidTransitionError,
  StaleVersionError,
} from "./inventoryMachine";
import type { InventoryMachine } from "./inventoryMachine";
import type { Reservation } from "./types";

/**
 * Concurrent-buyer simulation (Task 3.4).
 *
 * Fires `buyers` buyers at one inventory item at the same moment. Each buyer
 * arrives after a random delay, reads the item's version, waits a short
 * random "network latency", then tries to reserve one unit with the version it
 * read. Other buyers change the item in the meantime, so some attempts hit
 * StaleVersionError and are retried with a fresh read. A buyer who gets a hold
 * thinks for a random time and then either checks out or abandons the hold,
 * which later expires and returns the unit.
 *
 * Time, randomness and waiting are injectable so tests can run on a virtual
 * clock. The defaults use the real clock. The machine's own rule applies:
 * `now` must never go backwards between calls.
 */

export interface SimulationOptions {
  /** Number of concurrent buyers. Default 50. */
  buyers?: number;
  /** Buyers arrive after a random delay in [0, this]. Default 1500. */
  maxArrivalDelayMs?: number;
  /** Delay between reading the version and acting on it, in [0, this]. Default 80. */
  maxLatencyMs?: number;
  /** Delay between reserving and checking out, in [0, this]. Default 800. */
  maxThinkMs?: number;
  /** Share of buyers who never check out (their hold expires). Default 0.3. */
  abandonRate?: number;
  random?: () => number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SimulationReport {
  buyers: number;
  /** Stock of the item when the simulation began. */
  startingStock: number;
  /** Successful reservations (an expired hold can free a unit for a later buyer). */
  reserved: number;
  /** Reservations that were checked out, i.e. units actually sold. */
  checkedOut: number;
  /** StaleVersionError occurrences (each one was retried). */
  stale: number;
  /** Buyers turned away because no unit was free (insufficient stock, held or sold out). */
  insufficient: number;
  /** Holds that ended as expired. */
  expired: number;
  finalStock: number;
  /** True if more units were sold than existed (must always be false). */
  oversold: boolean;
}

/** Safety cap on retries per buyer; far above anything contention can cause. */
const MAX_ATTEMPTS = 100;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runSimulation(
  machine: InventoryMachine,
  itemId: string,
  options: SimulationOptions = {},
): Promise<SimulationReport> {
  const {
    buyers = 50,
    maxArrivalDelayMs = 1500,
    maxLatencyMs = 80,
    maxThinkMs = 800,
    abandonRate = 0.3,
    random = Math.random,
    now = Date.now,
    sleep = defaultSleep,
  } = options;

  if (!Number.isInteger(buyers) || buyers <= 0) {
    throw new RangeError("buyers must be a positive integer");
  }

  const startingStock = machine.getItem(itemId).stock;
  const counts = { reserved: 0, checkedOut: 0, stale: 0, insufficient: 0 };
  const pause = (maxMs: number) => sleep(random() * maxMs);

  /** Read the version, wait, then reserve 1 unit with that (possibly stale) version. */
  async function reserveUnit(buyerId: string): Promise<Reservation | null> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const seenVersion = machine.getItem(itemId).version;
      await pause(maxLatencyMs);
      try {
        const { reservation } = machine.reserve(itemId, buyerId, 1, seenVersion, now());
        counts.reserved++;
        return reservation;
      } catch (error) {
        if (error instanceof StaleVersionError) {
          counts.stale++;
          continue; // someone else changed the item first: re-read and retry
        }
        if (
          error instanceof InsufficientStockError ||
          error instanceof InvalidTransitionError
        ) {
          counts.insufficient++;
          return null;
        }
        throw error;
      }
    }
    return null;
  }

  async function checkoutHold(hold: Reservation): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const seenVersion = machine.getItem(itemId).version;
      await pause(maxLatencyMs);
      try {
        machine.checkout(hold.id, seenVersion, now());
        counts.checkedOut++;
        return;
      } catch (error) {
        if (error instanceof StaleVersionError) {
          counts.stale++;
          continue;
        }
        if (error instanceof InvalidTransitionError) {
          return; // the hold lapsed while waiting; it is counted as expired below
        }
        throw error;
      }
    }
  }

  async function runBuyer(index: number): Promise<void> {
    await pause(maxArrivalDelayMs);
    const hold = await reserveUnit(`buyer-${index}`);
    if (!hold) return;
    if (random() < abandonRate) return; // walks away; the hold will expire
    await pause(maxThinkMs);
    await checkoutHold(hold);
  }

  await Promise.all(Array.from({ length: buyers }, (_, index) => runBuyer(index)));

  // Let abandoned holds lapse, then record their expiry.
  const open = machine.getReservations(itemId).filter((r) => r.status === "active");
  if (open.length > 0) {
    const lastExpiry = Math.max(...open.map((r) => r.expiresAt));
    while (now() < lastExpiry) await sleep(lastExpiry - now());
    machine.expireReservations(now());
  }

  const item = machine.getItem(itemId);
  const expired = machine
    .getReservations(itemId)
    .filter((r) => r.status === "expired").length;

  return {
    buyers,
    startingStock,
    ...counts,
    expired,
    finalStock: item.stock,
    oversold: item.stock < 0 || counts.checkedOut > startingStock,
  };
}
