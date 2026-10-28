import { describe, expect, it } from "vitest";
import { InventoryMachine } from "./inventoryMachine";
import { runSimulation } from "./simulation";
import type { SimulationOptions } from "./simulation";

const ITEM = "inv-1";
const T0 = 1_700_000_000_000;

/** Small deterministic PRNG so every run is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A virtual clock: sleep() never really waits. drive() advances time to the
 * earliest sleeper whenever nothing else can run, so a whole simulation
 * finishes in milliseconds and always in the same order.
 */
function createVirtualClock() {
  let current = T0;
  let seq = 0;
  const sleepers: { at: number; seq: number; wake: () => void }[] = [];
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  return {
    now: () => current,
    sleep: (ms: number) =>
      new Promise<void>((wake) => {
        sleepers.push({ at: current + ms, seq: seq++, wake });
      }),
    async drive() {
      for (;;) {
        await settle(); // let every pending promise callback run
        sleepers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = sleepers.shift();
        if (!next) return;
        current = Math.max(current, next.at);
        next.wake();
      }
    },
  };
}

async function simulate(
  stock: number,
  seed: number,
  options: SimulationOptions & { holdMs?: number } = {},
) {
  const { holdMs = 2000, ...simulationOptions } = options;
  const machine = new InventoryMachine({
    inventory: [{ id: ITEM, productId: "prod-1", stock, status: "available", version: 0 }],
    reservationTtlMs: holdMs,
  });
  const clock = createVirtualClock();
  const finished = runSimulation(machine, ITEM, {
    random: mulberry32(seed),
    now: clock.now,
    sleep: clock.sleep,
    ...simulationOptions,
  });
  await clock.drive();
  return { report: await finished, machine };
}

describe("runSimulation", () => {
  it("never oversells: 50 buyers, many stocks and seeds", async () => {
    for (const stock of [1, 3, 5, 10]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { report, machine } = await simulate(stock, seed);

        expect(report.oversold).toBe(false);
        expect(report.finalStock >= 0).toBe(true);
        expect(report.finalStock).toBe(stock - report.checkedOut);
        expect(machine.getItem(ITEM).stock).toBe(report.finalStock);

        const completed = machine
          .getReservations(ITEM)
          .filter((r) => r.status === "completed");
        expect(completed).toHaveLength(report.checkedOut);
        const unitsSold = completed.reduce((sum, r) => sum + r.quantity, 0);
        expect(unitsSold).toBeLessThanOrEqual(stock);
      }
    }
  });

  it("winners never exceed stock (stocks 5, 10 and 3 from the sale)", async () => {
    for (const stock of [5, 10, 3]) {
      for (let seed = 100; seed < 110; seed++) {
        const { report } = await simulate(stock, seed);

        expect(report.checkedOut).toBeLessThanOrEqual(stock);
        expect(report.reserved).toBeGreaterThanOrEqual(report.checkedOut);
      }
    }
  });

  it("every buyer is either given a hold or turned away", async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { report } = await simulate(5, seed);

      expect(report.reserved + report.insufficient).toBe(50);
    }
  });

  it("really exercises the optimistic lock (stale versions happen and are retried)", async () => {
    let stale = 0;
    for (let seed = 1; seed <= 10; seed++) {
      stale += (await simulate(10, seed)).report.stale;
    }

    expect(stale).toBeGreaterThan(0);
  });

  it("when everyone checks out, exactly `stock` units sell and the rest are turned away", async () => {
    const { report, machine } = await simulate(3, 7, { abandonRate: 0, holdMs: 60_000 });

    expect(report.checkedOut).toBe(3);
    expect(report.finalStock).toBe(0);
    expect(report.insufficient).toBe(47);
    expect(report.expired).toBe(0);
    expect(machine.getItem(ITEM).status).toBe("sold_out");
  });

  it("abandoned holds expire and return stock, so later buyers can reserve", async () => {
    const { report, machine } = await simulate(2, 3, {
      abandonRate: 1,
      holdMs: 1000,
      maxArrivalDelayMs: 6000,
    });

    expect(report.checkedOut).toBe(0);
    expect(report.finalStock).toBe(2); // nothing sold, nothing lost
    expect(report.expired).toBe(report.reserved);
    expect(report.reserved).toBeGreaterThan(2); // units were reserved again after expiring
    expect(machine.getItem(ITEM).status).toBe("available");
    expect(report.oversold).toBe(false);
  });

  it("rejects a non-positive number of buyers", async () => {
    const machine = new InventoryMachine({
      inventory: [{ id: ITEM, productId: "prod-1", stock: 1, status: "available", version: 0 }],
      reservationTtlMs: 1000,
    });

    const error = await runSimulation(machine, ITEM, { buyers: 0 }).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error instanceof RangeError).toBe(true);
  });
});
