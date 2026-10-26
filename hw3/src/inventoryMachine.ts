import type {
  InventoryItem,
  InventoryStatus,
  Reservation,
  ReservationStatus,
} from "./types";

/**
 * Optimistic-lock inventory state machine (Task 3.3).
 *
 * Model
 *  - `stock` is the number of units NOT SOLD yet. Only checkout lowers it.
 *  - A hold is a `Reservation` record with its own `quantity` and `expiresAt`.
 *  - available = stock - quantity of holds that are active and not yet lapsed.
 *
 * Time is always passed in (`now`, epoch ms); this file never reads the clock.
 * A hold is valid while `now < expiresAt`; at `now >= expiresAt` it has lapsed.
 * Lapsed holds stop blocking stock immediately, even before
 * `expireReservations()` records the expiry, and can no longer be checked out.
 * `now` must never go backwards between calls (ClockRegressionError); that is
 * what keeps a lapsed hold from coming back to life and overselling.
 *
 * Item status (derived, recomputed after every change)
 *   sold_out   stock === 0
 *   reserved   stock > 0 but every remaining unit is held
 *   available  otherwise
 *   While "reserved", `reservedBy` / `reservedUntil` show the hold that lapses
 *   next, i.e. when units come back. Both are cleared in the other states.
 *
 * Transitions
 *   item         available --reserve--> available | reserved
 *                available | reserved --checkout--> available | reserved | sold_out
 *                reserved --expire--> available
 *                reserve is only allowed from "available"
 *   reservation  active --checkout--> completed
 *                active --expire--> expired
 *                completed | expired | cancelled accept no further action
 *
 * Versioning (optimistic lock). `Reservation` has no version, so every
 * `expectedVersion` is the version of the INVENTORY ITEM involved. Each change
 * to an item adds 1 to its version: a reserve, a checkout, and each
 * expireReservations() call that expired holds on it (once per item per call).
 * A caller whose version is stale gets StaleVersionError carrying
 * `actualVersion`, and can re-read and retry.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export class NotFoundError extends InventoryError {
  readonly entity: "item" | "reservation";
  readonly id: string;
  constructor(entity: "item" | "reservation", id: string) {
    super(`${entity} "${id}" not found`);
    this.name = "NotFoundError";
    this.entity = entity;
    this.id = id;
  }
}

export class InvalidQuantityError extends InventoryError {
  readonly quantity: number;
  constructor(quantity: number) {
    super(`quantity must be a positive integer, got ${quantity}`);
    this.name = "InvalidQuantityError";
    this.quantity = quantity;
  }
}

/** The caller's version of the item is out of date: someone changed it first. */
export class StaleVersionError extends InventoryError {
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(itemId: string, expectedVersion: number, actualVersion: number) {
    super(
      `stale version for item "${itemId}": expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "StaleVersionError";
    this.itemId = itemId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/** The action is not allowed from the entity's current state. */
export class InvalidTransitionError extends InventoryError {
  readonly entity: "item" | "reservation";
  readonly id: string;
  readonly from: InventoryStatus | ReservationStatus;
  readonly action: "reserve" | "checkout";
  readonly reason: string;
  constructor(
    entity: "item" | "reservation",
    id: string,
    from: InventoryStatus | ReservationStatus,
    action: "reserve" | "checkout",
    reason: string,
  ) {
    super(`cannot ${action} ${entity} "${id}" from "${from}": ${reason}`);
    this.name = "InvalidTransitionError";
    this.entity = entity;
    this.id = id;
    this.from = from;
    this.action = action;
    this.reason = reason;
  }
}

/** The item is "available" but has fewer free units than requested. */
export class InsufficientStockError extends InventoryError {
  readonly itemId: string;
  readonly requested: number;
  readonly available: number;
  constructor(itemId: string, requested: number, available: number) {
    super(
      `item "${itemId}": requested ${requested}, only ${available} available`,
    );
    this.name = "InsufficientStockError";
    this.itemId = itemId;
    this.requested = requested;
    this.available = available;
  }
}

/** `now` is earlier than a time the machine has already seen. */
export class ClockRegressionError extends InventoryError {
  readonly now: number;
  readonly lastNow: number;
  constructor(now: number, lastNow: number) {
    super(`now (${now}) is earlier than the last seen time (${lastNow})`);
    this.name = "ClockRegressionError";
    this.now = now;
    this.lastNow = lastNow;
  }
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export interface InventoryMachineOptions {
  /** Starting inventory. Copied; the objects passed in are never mutated. */
  inventory: readonly InventoryItem[];
  /** How long a reservation holds stock. */
  reservationTtlMs: number;
}

/** Result of reserve() and checkout(): copies of the records after the change. */
export interface TransitionResult {
  reservation: Reservation;
  item: InventoryItem;
}

interface ItemView {
  status: InventoryStatus;
  available: number;
  /** The valid hold that lapses next (only meaningful when "reserved"). */
  nextHold: Reservation | undefined;
}

export class InventoryMachine {
  private readonly items = new Map<string, InventoryItem>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly reservationTtlMs: number;
  private nextReservationNumber = 1;
  private lastNow = Number.NEGATIVE_INFINITY;

  constructor(options: InventoryMachineOptions) {
    if (!Number.isFinite(options.reservationTtlMs) || options.reservationTtlMs <= 0) {
      throw new RangeError("reservationTtlMs must be a positive finite number");
    }
    this.reservationTtlMs = options.reservationTtlMs;
    for (const item of options.inventory) {
      this.items.set(item.id, { ...item });
    }
  }

  // ---- commands ---------------------------------------------------------

  /** Holds `quantity` units of an item for `buyerId` until `now + ttl`. */
  reserve(
    itemId: string,
    buyerId: string,
    quantity: number,
    expectedVersion: number,
    now: number,
  ): TransitionResult {
    this.observe(now);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidQuantityError(quantity);
    }
    const item = this.requireItem(itemId);
    this.assertVersion(item, expectedVersion);

    const view = this.view(item, now);
    if (view.status !== "available") {
      throw new InvalidTransitionError(
        "item",
        item.id,
        view.status,
        "reserve",
        view.status === "sold_out" ? "no units left" : "every remaining unit is held",
      );
    }
    if (quantity > view.available) {
      throw new InsufficientStockError(item.id, quantity, view.available);
    }

    const reservation: Reservation = {
      id: `res-${this.nextReservationNumber++}`,
      inventoryItemId: item.id,
      productId: item.productId,
      userId: buyerId,
      quantity,
      status: "active",
      createdAt: now,
      expiresAt: now + this.reservationTtlMs,
    };
    this.reservations.set(reservation.id, reservation);
    this.commit(item, now);

    return { reservation: { ...reservation }, item: { ...item } };
  }

  /** Turns an active, unexpired hold into a sale: stock goes down by its quantity. */
  checkout(
    reservationId: string,
    expectedVersion: number,
    now: number,
  ): TransitionResult {
    this.observe(now);
    const reservation = this.requireReservation(reservationId);
    const item = this.requireItem(reservation.inventoryItemId);
    this.assertVersion(item, expectedVersion);

    if (reservation.status !== "active") {
      throw new InvalidTransitionError(
        "reservation",
        reservation.id,
        reservation.status,
        "checkout",
        `reservation is ${reservation.status}`,
      );
    }
    if (now >= reservation.expiresAt) {
      throw new InvalidTransitionError(
        "reservation",
        reservation.id,
        reservation.status,
        "checkout",
        "the hold has lapsed",
      );
    }

    item.stock -= reservation.quantity;
    reservation.status = "completed";
    reservation.completedAt = now;
    this.commit(item, now);

    return { reservation: { ...reservation }, item: { ...item } };
  }

  /**
   * Marks every lapsed hold (`expiresAt <= now`) as expired. Their units
   * become available again; stock itself never changed. Returns the holds
   * that expired in this call (empty if none).
   */
  expireReservations(now: number): Reservation[] {
    this.observe(now);

    const expired: Reservation[] = [];
    const touched = new Set<string>();
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "active" && reservation.expiresAt <= now) {
        reservation.status = "expired";
        expired.push({ ...reservation });
        touched.add(reservation.inventoryItemId);
      }
    }
    for (const itemId of touched) {
      this.commit(this.requireItem(itemId), now);
    }
    return expired;
  }

  // ---- queries (read-only, return copies) -------------------------------

  getItem(itemId: string): InventoryItem {
    return { ...this.requireItem(itemId) };
  }

  getReservation(reservationId: string): Reservation {
    return { ...this.requireReservation(reservationId) };
  }

  /** All reservations (optionally of one item), oldest first. */
  getReservations(itemId?: string): Reservation[] {
    return [...this.reservations.values()]
      .filter((r) => itemId === undefined || r.inventoryItemId === itemId)
      .map((r) => ({ ...r }));
  }

  /** Units that could be reserved right now: stock minus valid holds. */
  getAvailable(itemId: string, now: number): number {
    return this.view(this.requireItem(itemId), now).available;
  }

  // ---- internals --------------------------------------------------------

  /** Rejects a clock that moves backwards, then remembers the time. */
  private observe(now: number): void {
    if (now < this.lastNow) throw new ClockRegressionError(now, this.lastNow);
    this.lastNow = now;
  }

  private requireItem(itemId: string): InventoryItem {
    const item = this.items.get(itemId);
    if (!item) throw new NotFoundError("item", itemId);
    return item;
  }

  private requireReservation(reservationId: string): Reservation {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new NotFoundError("reservation", reservationId);
    return reservation;
  }

  private assertVersion(item: InventoryItem, expectedVersion: number): void {
    if (expectedVersion !== item.version) {
      throw new StaleVersionError(item.id, expectedVersion, item.version);
    }
  }

  /** Status and free units of an item as of `now`. Does not modify anything. */
  private view(item: InventoryItem, now: number): ItemView {
    let held = 0;
    let nextHold: Reservation | undefined;
    for (const r of this.reservations.values()) {
      if (r.inventoryItemId !== item.id || r.status !== "active" || r.expiresAt <= now) {
        continue;
      }
      held += r.quantity;
      if (!nextHold || r.expiresAt < nextHold.expiresAt) nextHold = r;
    }

    const available = item.stock - held;
    let status: InventoryStatus;
    if (item.stock === 0) status = "sold_out";
    else if (available <= 0) status = "reserved";
    else status = "available";
    return { status, available, nextHold };
  }

  /** Records a change to an item: version +1 and status/hold summary refreshed. */
  private commit(item: InventoryItem, now: number): void {
    const view = this.view(item, now);
    item.version += 1;
    item.status = view.status;
    if (view.status === "reserved" && view.nextHold) {
      item.reservedBy = view.nextHold.userId;
      item.reservedUntil = view.nextHold.expiresAt;
    } else {
      delete item.reservedBy;
      delete item.reservedUntil;
    }
  }
}
