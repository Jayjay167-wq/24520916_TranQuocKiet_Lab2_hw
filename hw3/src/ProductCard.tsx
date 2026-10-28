import { useId, useState } from "react";
import { Countdown } from "./Countdown";
import type { InventoryItem, InventoryStatus, Product, Reservation } from "./types";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

const STATUS_LABEL: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Fully reserved (every remaining unit is on hold)",
  sold_out: "Sold out",
};

interface ProductCardProps {
  product: Product;
  item: InventoryItem;
  /** Units that can be reserved right now (stock minus active holds). */
  available: number;
  /** The current buyer's active hold on this item, if any. */
  hold: Reservation | undefined;
  onReserve: (quantity: number) => void;
  onCheckout: (hold: Reservation) => void;
  /** Called when the hold's countdown reaches 0. */
  onHoldExpired: () => void;
}

export function ProductCard({
  product,
  item,
  available,
  hold,
  onReserve,
  onCheckout,
  onHoldExpired,
}: ProductCardProps) {
  const headingId = useId();
  const quantityId = useId();
  const [quantity, setQuantity] = useState(1);

  const canReserve = item.status === "available" && available > 0 && !hold;
  const canCheckout = hold !== undefined;

  // aria-disabled (not `disabled`) keeps the button focusable, so keyboard
  // focus is not lost when a button becomes unavailable after being pressed.
  function handleReserve() {
    if (!canReserve) return;
    onReserve(Math.min(Math.max(1, quantity), available));
  }

  function handleCheckout() {
    if (hold) onCheckout(hold);
  }

  return (
    <article
      aria-labelledby={headingId}
      style={{ border: "1px solid #767676", padding: "1rem", minWidth: 240, flex: "1 1 240px" }}
    >
      <h3 id={headingId}>{product.name}</h3>
      <p>
        <s>{vnd.format(product.originalPrice)}</s>{" "}
        <strong>{vnd.format(product.salePrice)}</strong>
      </p>
      <p>
        Status: <strong>{STATUS_LABEL[item.status]}</strong>
      </p>
      <p>
        Stock: {item.stock} · Free to reserve now: {available}
      </p>

      {hold ? (
        <p>
          You hold {hold.quantity} unit{hold.quantity === 1 ? "" : "s"}. Hold expires in{" "}
          {/* key: a new hold starts a new countdown */}
          <Countdown
            key={hold.id}
            durationMs={hold.expiresAt - Date.now()}
            onComplete={onHoldExpired}
            label={`Hold on ${product.name} expires in`}
          />
        </p>
      ) : (
        <p>
          <label htmlFor={quantityId}>Quantity </label>
          <input
            id={quantityId}
            type="number"
            min={1}
            max={Math.max(1, available)}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
          />
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={handleReserve} aria-disabled={!canReserve}>
          Reserve
        </button>
        <button type="button" onClick={handleCheckout} aria-disabled={!canCheckout}>
          Checkout
        </button>
      </div>
    </article>
  );
}
