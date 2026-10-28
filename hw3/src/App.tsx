import { useState } from "react";
import { Countdown } from "./Countdown";
import { ProductCard } from "./ProductCard";
import {
  InsufficientStockError,
  InvalidTransitionError,
  InventoryError,
  InventoryMachine,
  StaleVersionError,
} from "./inventoryMachine";
import { saleScenario } from "./saleScenario";
import { runSimulation } from "./simulation";
import type { SimulationReport } from "./simulation";
import type { InventoryItem, Product, Reservation } from "./types";

const BUYER_ID = "you";
const MAX_RETRIES = 3;
/** Short holds for the simulation so it finishes in a few seconds. */
const SIMULATION_HOLD_MS = 2000;
const SIMULATION_BUYERS = 50;

// ---- helpers -----------------------------------------------------------

function getSalePhase(now: number): { label: string; durationMs: number } | null {
  if (now < saleScenario.startsAt) {
    return { label: "Sale starts in", durationMs: saleScenario.startsAt - now };
  }
  if (now < saleScenario.endsAt) {
    return { label: "Sale ends in", durationMs: saleScenario.endsAt - now };
  }
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof StaleVersionError) {
    return "The item changed while you were acting. Please try again.";
  }
  if (error instanceof InsufficientStockError) {
    return `Only ${error.available} unit${error.available === 1 ? "" : "s"} free right now.`;
  }
  if (error instanceof InvalidTransitionError) {
    if (error.entity === "item") {
      return error.from === "sold_out"
        ? "Sold out."
        : "Every remaining unit is held by other buyers right now.";
    }
    return error.from === "active"
      ? "Your hold expired, so the units were released."
      : `This reservation is already ${error.from}.`;
  }
  if (error instanceof InventoryError) return error.message;
  return "Something went wrong.";
}

/**
 * Optimistic-lock pattern: try with the version the screen showed; if the
 * item changed meanwhile (StaleVersionError), retry with the current version.
 */
function withRetry<R>(shownVersion: number, run: (version: number) => R): R {
  let version = shownVersion;
  for (let attempt = 0; ; attempt++) {
    try {
      return run(version);
    } catch (error) {
      if (error instanceof StaleVersionError && attempt < MAX_RETRIES) {
        version = error.actualVersion;
        continue;
      }
      throw error;
    }
  }
}

function readSnapshot(machine: InventoryMachine) {
  const now = Date.now();
  const items = saleScenario.initialInventory.map((initial) => machine.getItem(initial.id));
  return {
    items,
    available: Object.fromEntries(items.map((item) => [item.id, machine.getAvailable(item.id, now)])),
    reservations: machine.getReservations(),
  };
}

// ---- component ---------------------------------------------------------

export default function App() {
  const [machine] = useState(
    () =>
      new InventoryMachine({
        inventory: saleScenario.initialInventory,
        reservationTtlMs: saleScenario.reservationTtlMs,
      }),
  );
  const [snapshot, setSnapshot] = useState(() => readSnapshot(machine));
  const [phase, setPhase] = useState(() => getSalePhase(Date.now()));
  // `count` alternates a trailing nbsp so an identical message is announced again.
  const [message, setMessage] = useState({ text: "", count: 0 });

  const [simulationItemId, setSimulationItemId] = useState(
    saleScenario.initialInventory[0].id,
  );
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [report, setReport] = useState<(SimulationReport & { productName: string }) | null>(
    null,
  );

  const announce = (text: string) =>
    setMessage((previous) => ({ text, count: previous.count + 1 }));
  const refresh = () => setSnapshot(readSnapshot(machine));

  function handleReserve(product: Product, item: InventoryItem, quantity: number) {
    try {
      const { reservation } = withRetry(item.version, (version) =>
        machine.reserve(item.id, BUYER_ID, quantity, version, Date.now()),
      );
      announce(
        `Reserved ${reservation.quantity} × ${product.name}. Check out before the hold expires.`,
      );
    } catch (error) {
      announce(describeError(error));
    }
    refresh();
  }

  function handleCheckout(product: Product, item: InventoryItem, hold: Reservation) {
    try {
      withRetry(item.version, (version) => machine.checkout(hold.id, version, Date.now()));
      announce(`Purchased ${hold.quantity} × ${product.name}. Thank you!`);
    } catch (error) {
      announce(describeError(error));
    }
    refresh();
  }

  function handleHoldExpired() {
    try {
      const expired = machine.expireReservations(Date.now());
      if (expired.length > 0) {
        announce("Your hold expired. The units are available again.");
      }
    } catch (error) {
      announce(describeError(error));
    }
    refresh();
  }

  async function handleRunSimulation() {
    if (simulationRunning) return;
    const initial = saleScenario.initialInventory.find((i) => i.id === simulationItemId);
    const product = saleScenario.products.find((p) => p.id === initial?.productId);
    if (!initial || !product) return;

    setSimulationRunning(true);
    setReport(null);
    announce(`Simulation started: ${SIMULATION_BUYERS} buyers competing for ${product.name}.`);
    try {
      // A scratch machine, so the simulation never touches the live stock above.
      const scratch = new InventoryMachine({
        inventory: saleScenario.initialInventory,
        reservationTtlMs: SIMULATION_HOLD_MS,
      });
      const result = await runSimulation(scratch, simulationItemId, {
        buyers: SIMULATION_BUYERS,
      });
      setReport({ ...result, productName: product.name });
      announce(
        result.oversold
          ? "Simulation finished: OVERSOLD. This is a bug."
          : `Simulation finished: ${result.checkedOut} of ${result.startingStock} units sold, no oversell.`,
      );
    } catch (error) {
      announce(describeError(error));
    } finally {
      setSimulationRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "1rem" }}>
      <h1>{saleScenario.name}</h1>
      {phase ? (
        <p>
          {phase.label}{" "}
          <Countdown
            key={phase.label}
            durationMs={phase.durationMs}
            onComplete={() => setPhase(getSalePhase(Date.now()))}
            label={phase.label}
          />
        </p>
      ) : (
        <p>The sale has ended.</p>
      )}

      <p role="status" aria-live="polite" aria-atomic="true">
        {message.text}
        {message.count % 2 === 1 ? "\u00A0" : ""}
      </p>

      <section aria-labelledby="products-heading">
        <h2 id="products-heading">Products</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {saleScenario.products.map((product) => {
            const item = snapshot.items.find((i) => i.productId === product.id);
            if (!item) return null;
            const hold = snapshot.reservations.find(
              (r) =>
                r.inventoryItemId === item.id &&
                r.userId === BUYER_ID &&
                r.status === "active",
            );
            return (
              <ProductCard
                key={product.id}
                product={product}
                item={item}
                available={snapshot.available[item.id]}
                hold={hold}
                onReserve={(quantity) => handleReserve(product, item, quantity)}
                onCheckout={(activeHold) => handleCheckout(product, item, activeHold)}
                onHoldExpired={handleHoldExpired}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="simulation-heading">
        <h2 id="simulation-heading">Simulation</h2>
        <p>
          {SIMULATION_BUYERS} buyers compete for one product at the same time, on a separate
          copy of the stock (your own purchases above are not affected).
        </p>
        <p>
          <label htmlFor="simulation-product">Product </label>
          <select
            id="simulation-product"
            value={simulationItemId}
            onChange={(event) => setSimulationItemId(event.target.value)}
          >
            {saleScenario.initialInventory.map((initial) => {
              const product = saleScenario.products.find((p) => p.id === initial.productId);
              return (
                <option key={initial.id} value={initial.id}>
                  {product?.name} (stock {initial.stock})
                </option>
              );
            })}
          </select>{" "}
          <button type="button" onClick={handleRunSimulation} aria-disabled={simulationRunning}>
            {simulationRunning ? "Running simulation…" : "Run simulation"}
          </button>
        </p>

        {report && (
          <table>
            <caption>
              Simulation report: {report.productName}, {report.buyers} buyers
            </caption>
            <tbody>
              <tr><th scope="row">Starting stock</th><td>{report.startingStock}</td></tr>
              <tr><th scope="row">Reserved</th><td>{report.reserved}</td></tr>
              <tr><th scope="row">Checked out (sold)</th><td>{report.checkedOut}</td></tr>
              <tr><th scope="row">Stale-version retries</th><td>{report.stale}</td></tr>
              <tr><th scope="row">Turned away (no free units)</th><td>{report.insufficient}</td></tr>
              <tr><th scope="row">Holds expired</th><td>{report.expired}</td></tr>
              <tr><th scope="row">Final stock</th><td>{report.finalStock}</td></tr>
              <tr><th scope="row">Oversold</th><td>{report.oversold ? "YES (bug)" : "No"}</td></tr>
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}