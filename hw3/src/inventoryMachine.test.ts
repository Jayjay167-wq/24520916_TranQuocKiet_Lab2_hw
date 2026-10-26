import { describe, expect, it } from "vitest";
import {
  ClockRegressionError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidTransitionError,
  InventoryMachine,
  NotFoundError,
  StaleVersionError,
} from "./inventoryMachine";
import { saleScenario } from "./saleScenario";

const ITEM = "inv-1";
const T0 = 1_700_000_000_000;
const TTL = 60_000;

function makeMachine(stock: number): InventoryMachine {
  return new InventoryMachine({
    inventory: [
      { id: ITEM, productId: "prod-1", stock, status: "available", version: 0 },
    ],
    reservationTtlMs: TTL,
  });
}

/** Returns what `fn` throws (or undefined), so tests can check class and fields. */
function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("valid transitions", () => {
  it("reserve creates an active hold and bumps the version", () => {
    const machine = makeMachine(3);

    const { reservation, item } = machine.reserve(ITEM, "alice", 2, 0, T0);

    expect(reservation.id).toBe("res-1");
    expect(reservation.userId).toBe("alice");
    expect(reservation.quantity).toBe(2);
    expect(reservation.status).toBe("active");
    expect(reservation.createdAt).toBe(T0);
    expect(reservation.expiresAt).toBe(T0 + TTL);
    expect(item.version).toBe(1);
    expect(item.stock).toBe(3); // stock only drops at checkout
    expect(item.status).toBe("available"); // one unit is still free
    expect(machine.getAvailable(ITEM, T0)).toBe(1);
  });

  it("holding the last free units makes the item reserved, showing the next hold to lapse", () => {
    const machine = makeMachine(2);
    machine.reserve(ITEM, "alice", 1, 0, T0);
    const { item } = machine.reserve(ITEM, "bob", 1, 1, T0 + 1000);

    expect(item.status).toBe("reserved");
    expect(item.reservedBy).toBe("alice"); // alice's hold lapses first
    expect(item.reservedUntil).toBe(T0 + TTL);
    expect(item.version).toBe(2);
    expect(machine.getAvailable(ITEM, T0 + 1000)).toBe(0);
  });

  it("checkout completes the hold and lowers stock", () => {
    const machine = makeMachine(3);
    const { reservation } = machine.reserve(ITEM, "alice", 2, 0, T0);

    const result = machine.checkout(reservation.id, 1, T0 + 5000);

    expect(result.reservation.status).toBe("completed");
    expect(result.reservation.completedAt).toBe(T0 + 5000);
    expect(result.item.stock).toBe(1);
    expect(result.item.version).toBe(2);
    expect(result.item.status).toBe("available");
    expect(machine.getAvailable(ITEM, T0 + 5000)).toBe(1);
  });

  it("selling the last units makes the item sold_out and clears the hold summary", () => {
    const machine = makeMachine(1);
    const { reservation, item } = machine.reserve(ITEM, "alice", 1, 0, T0);
    expect(item.status).toBe("reserved");
    expect(item.reservedBy).toBe("alice");

    const result = machine.checkout(reservation.id, 1, T0 + 1);

    expect(result.item.stock).toBe(0);
    expect(result.item.status).toBe("sold_out");
    expect(result.item.reservedBy).toBeUndefined();
    expect(result.item.reservedUntil).toBeUndefined();
  });

  it("does not modify the inventory objects it was given, and returns copies", () => {
    const input = Object.freeze({
      id: ITEM,
      productId: "prod-1",
      stock: 1,
      status: "available" as const,
      version: 0,
    });
    const machine = new InventoryMachine({ inventory: [input], reservationTtlMs: TTL });

    machine.reserve(ITEM, "alice", 1, 0, T0);
    expect(input.version).toBe(0);
    expect(input.stock).toBe(1);

    const copy = machine.getItem(ITEM);
    copy.stock = 99;
    expect(machine.getItem(ITEM).stock).toBe(1);
  });

  it("works with the Vietnam 11.11 scenario data", () => {
    const machine = new InventoryMachine({
      inventory: saleScenario.initialInventory,
      reservationTtlMs: saleScenario.reservationTtlMs,
    });

    const { item } = machine.reserve("inv-earbuds", "alice", 5, 0, saleScenario.startsAt);

    expect(item.status).toBe("reserved");
    expect(saleScenario.initialInventory[0].stock).toBe(5);
    expect(saleScenario.initialInventory[0].version).toBe(0);
  });
});

describe("invalid transitions", () => {
  it("rejects a second checkout of the same reservation", () => {
    const machine = makeMachine(3);
    const { reservation } = machine.reserve(ITEM, "alice", 1, 0, T0);
    machine.checkout(reservation.id, 1, T0 + 1);

    const error = catchError(() => machine.checkout(reservation.id, 2, T0 + 2));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    const typed = error as InvalidTransitionError;
    expect(typed.entity).toBe("reservation");
    expect(typed.from).toBe("completed");
    expect(typed.action).toBe("checkout");
    expect(machine.getItem(ITEM).stock).toBe(2); // not sold twice
  });

  it("rejects checkout of a reservation that was already expired", () => {
    const machine = makeMachine(3);
    const { reservation } = machine.reserve(ITEM, "alice", 1, 0, T0);
    machine.expireReservations(T0 + TTL); // item version is now 2

    const error = catchError(() => machine.checkout(reservation.id, 2, T0 + TTL + 1));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).from).toBe("expired");
  });

  it("rejects checkout after the hold lapsed, even before it was swept, and changes nothing", () => {
    const machine = makeMachine(3);
    const { reservation } = machine.reserve(ITEM, "alice", 1, 0, T0);

    const error = catchError(() => machine.checkout(reservation.id, 1, T0 + TTL));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).reason).toBe("the hold has lapsed");
    expect(machine.getItem(ITEM).stock).toBe(3);
    expect(machine.getItem(ITEM).version).toBe(1);
    expect(machine.getReservation(reservation.id).status).toBe("active");
  });

  it("rejects reserve when every remaining unit is held", () => {
    const machine = makeMachine(1);
    machine.reserve(ITEM, "alice", 1, 0, T0);

    const error = catchError(() => machine.reserve(ITEM, "bob", 1, 1, T0 + 1));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    const typed = error as InvalidTransitionError;
    expect(typed.entity).toBe("item");
    expect(typed.from).toBe("reserved");
    expect(typed.action).toBe("reserve");
  });

  it("rejects reserve on a sold_out item", () => {
    const machine = makeMachine(1);
    const { reservation } = machine.reserve(ITEM, "alice", 1, 0, T0);
    machine.checkout(reservation.id, 1, T0 + 1);

    const error = catchError(() => machine.reserve(ITEM, "bob", 1, 2, T0 + 2));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).from).toBe("sold_out");
  });

  it("rejects asking for more than the free units", () => {
    const machine = makeMachine(3);
    machine.reserve(ITEM, "alice", 2, 0, T0);

    const error = catchError(() => machine.reserve(ITEM, "bob", 2, 1, T0 + 1));

    expect(error).toBeInstanceOf(InsufficientStockError);
    const typed = error as InsufficientStockError;
    expect(typed.requested).toBe(2);
    expect(typed.available).toBe(1);
    expect(machine.getItem(ITEM).version).toBe(1); // nothing changed
  });

  it("rejects bad quantities and unknown ids", () => {
    const machine = makeMachine(3);

    expect(catchError(() => machine.reserve(ITEM, "a", 0, 0, T0))).toBeInstanceOf(InvalidQuantityError);
    expect(catchError(() => machine.reserve(ITEM, "a", 1.5, 0, T0))).toBeInstanceOf(InvalidQuantityError);
    expect(catchError(() => machine.reserve(ITEM, "a", -1, 0, T0))).toBeInstanceOf(InvalidQuantityError);
    expect(catchError(() => machine.reserve("nope", "a", 1, 0, T0))).toBeInstanceOf(NotFoundError);
    expect(catchError(() => machine.checkout("res-404", 0, T0))).toBeInstanceOf(NotFoundError);
  });

  it("rejects a clock that goes backwards", () => {
    const machine = makeMachine(3);
    machine.reserve(ITEM, "alice", 1, 0, T0 + 1000);

    const error = catchError(() => machine.reserve(ITEM, "bob", 1, 1, T0));

    expect(error).toBeInstanceOf(ClockRegressionError);
  });
});

describe("stale version", () => {
  it("rejects a reserve made with an old version, then succeeds after a retry", () => {
    const machine = makeMachine(3);
    // Alice and Bob both read version 0.
    machine.reserve(ITEM, "alice", 1, 0, T0);

    const error = catchError(() => machine.reserve(ITEM, "bob", 1, 0, T0));

    expect(error).toBeInstanceOf(StaleVersionError);
    const typed = error as StaleVersionError;
    expect(typed.itemId).toBe(ITEM);
    expect(typed.expectedVersion).toBe(0);
    expect(typed.actualVersion).toBe(1);
    expect(machine.getReservations()).toHaveLength(1); // bob's hold was not created
    expect(machine.getItem(ITEM).version).toBe(1); // and nothing changed

    const retry = machine.reserve(ITEM, "bob", 1, typed.actualVersion, T0);
    expect(retry.item.version).toBe(2);
  });

  it("rejects a checkout made with an old version", () => {
    const machine = makeMachine(3);
    const { reservation } = machine.reserve(ITEM, "alice", 1, 0, T0); // version 1
    machine.reserve(ITEM, "bob", 1, 1, T0); // version 2: item changed under alice

    const error = catchError(() => machine.checkout(reservation.id, 1, T0 + 1));

    expect(error).toBeInstanceOf(StaleVersionError);
    expect((error as StaleVersionError).actualVersion).toBe(2);
    expect(machine.getItem(ITEM).stock).toBe(3);

    const ok = machine.checkout(reservation.id, 2, T0 + 1);
    expect(ok.reservation.status).toBe("completed");
    expect(ok.item.version).toBe(3);
  });

  it("increases the version by 1 on every change", () => {
    const machine = makeMachine(3);
    const versions = [machine.getItem(ITEM).version];

    const a = machine.reserve(ITEM, "alice", 1, 0, T0);
    versions.push(a.item.version);
    const b = machine.reserve(ITEM, "bob", 1, 1, T0);
    versions.push(b.item.version);
    versions.push(machine.checkout(a.reservation.id, 2, T0 + 1).item.version);
    machine.expireReservations(T0 + TTL); // bob's hold lapses
    versions.push(machine.getItem(ITEM).version);

    expect(versions).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("expiry returns stock", () => {
  it("expired holds free their units, and stock itself is untouched", () => {
    const machine = makeMachine(2);
    machine.reserve(ITEM, "alice", 2, 0, T0);
    expect(machine.getItem(ITEM).status).toBe("reserved");
    expect(machine.getAvailable(ITEM, T0)).toBe(0);

    const expired = machine.expireReservations(T0 + TTL);

    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe("expired");
    expect(expired[0].userId).toBe("alice");
    const item = machine.getItem(ITEM);
    expect(item.stock).toBe(2);
    expect(item.status).toBe("available");
    expect(item.reservedBy).toBeUndefined();
    expect(item.reservedUntil).toBeUndefined();
    expect(item.version).toBe(2);
    expect(machine.getAvailable(ITEM, T0 + TTL)).toBe(2);

    // The returned units can be reserved again.
    const again = machine.reserve(ITEM, "bob", 2, 2, T0 + TTL);
    expect(again.item.status).toBe("reserved");
  });

  it("only expires holds that have lapsed; the boundary instant counts as lapsed", () => {
    const machine = makeMachine(3);
    machine.reserve(ITEM, "alice", 1, 0, T0);
    machine.reserve(ITEM, "bob", 1, 1, T0 + 10_000);

    expect(machine.expireReservations(T0 + TTL - 1)).toHaveLength(0);
    expect(machine.getItem(ITEM).version).toBe(2); // nothing expired: no change

    const expired = machine.expireReservations(T0 + TTL); // exactly alice's expiresAt
    expect(expired.map((r) => r.userId)).toEqual(["alice"]);
    expect(machine.getReservations().map((r) => r.status)).toEqual(["expired", "active"]);
    expect(machine.getAvailable(ITEM, T0 + TTL)).toBe(2);
  });

  it("bumps the version once per item per sweep", () => {
    const machine = makeMachine(5);
    machine.reserve(ITEM, "alice", 1, 0, T0);
    machine.reserve(ITEM, "bob", 1, 1, T0);
    machine.reserve(ITEM, "carol", 1, 2, T0); // version 3

    const expired = machine.expireReservations(T0 + TTL);

    expect(expired).toHaveLength(3);
    expect(machine.getItem(ITEM).version).toBe(4);
  });

  it("a lapsed hold stops blocking stock even before the sweep runs", () => {
    const machine = makeMachine(1);
    machine.reserve(ITEM, "alice", 1, 0, T0);

    expect(machine.getAvailable(ITEM, T0 + TTL)).toBe(1);
    const result = machine.reserve(ITEM, "bob", 1, 1, T0 + TTL);

    expect(result.reservation.userId).toBe("bob");
  });
});

describe("no oversell", () => {
  it("never sells the last unit twice", () => {
    const machine = makeMachine(1);
    const alice = machine.reserve(ITEM, "alice", 1, 0, T0);

    // Bob cannot take the unit while Alice holds it.
    expect(catchError(() => machine.reserve(ITEM, "bob", 1, 1, T0 + 1))).toBeInstanceOf(
      InvalidTransitionError,
    );

    machine.checkout(alice.reservation.id, 1, T0 + 2);
    expect(machine.getItem(ITEM).stock).toBe(0);

    // Nor after it is sold.
    expect(catchError(() => machine.reserve(ITEM, "bob", 1, 2, T0 + 3))).toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(machine.getItem(ITEM).stock).toBe(0);
  });

  it("a lapsed hold cannot be checked out after the unit was re-reserved", () => {
    const machine = makeMachine(1);
    const alice = machine.reserve(ITEM, "alice", 1, 0, T0);
    const bob = machine.reserve(ITEM, "bob", 1, 1, T0 + TTL); // alice's hold has lapsed

    // Alice comes back too late.
    const error = catchError(() => machine.checkout(alice.reservation.id, 2, T0 + TTL + 1));
    expect(error).toBeInstanceOf(InvalidTransitionError);

    // The sweep records alice's expiry; bob's hold is untouched.
    const expired = machine.expireReservations(T0 + TTL + 1);
    expect(expired.map((r) => r.userId)).toEqual(["alice"]);

    const sold = machine.checkout(bob.reservation.id, 3, T0 + TTL + 2);
    expect(sold.item.stock).toBe(0);
    expect(sold.item.status).toBe("sold_out");
    expect(
      machine.getReservations().filter((r) => r.status === "completed"),
    ).toHaveLength(1);
  });

  it("20 buyers racing for 3 units: exactly 3 win, stock never goes negative", () => {
    const machine = makeMachine(3);
    const buyers = Array.from({ length: 20 }, (_, i) => `buyer-${i}`);
    // Everyone reads the item before anyone acts.
    const versionsSeen = buyers.map(() => machine.getItem(ITEM).version);

    const winners: string[] = [];
    const losers: unknown[] = [];
    buyers.forEach((buyer, i) => {
      let expectedVersion = versionsSeen[i];
      for (;;) {
        try {
          machine.reserve(ITEM, buyer, 1, expectedVersion, T0);
          winners.push(buyer);
          return;
        } catch (error) {
          if (error instanceof StaleVersionError) {
            expectedVersion = error.actualVersion; // re-read and retry
            continue;
          }
          losers.push(error);
          return;
        }
      }
    });

    expect(winners).toEqual(["buyer-0", "buyer-1", "buyer-2"]);
    expect(losers).toHaveLength(17);
    expect(losers.every((e) => e instanceof InvalidTransitionError)).toBe(true);
    expect(machine.getAvailable(ITEM, T0)).toBe(0);

    for (const hold of machine.getReservations(ITEM)) {
      machine.checkout(hold.id, machine.getItem(ITEM).version, T0 + 1);
    }

    const item = machine.getItem(ITEM);
    expect(item.stock).toBe(0);
    expect(item.status).toBe("sold_out");
    const soldUnits = machine
      .getReservations(ITEM)
      .filter((r) => r.status === "completed")
      .reduce((sum, r) => sum + r.quantity, 0);
    expect(soldUnits).toBe(3);
  });
});
