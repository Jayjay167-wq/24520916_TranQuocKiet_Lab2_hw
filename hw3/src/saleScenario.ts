import type { InventoryItem, Product, SaleScenario } from "./types";

/**
 * "Vietnam 11.11 Midnight Flash Sale" – data only, no logic.
 *
 * The sale opens at 00:00 on 11 November 2026 (Vietnam time, UTC+7) and runs
 * for two hours. Stock is deliberately tiny (5, 10 and 3 units) so that many
 * buyers compete for very few items.
 */

const products: readonly Product[] = [
  {
    id: "prod-earbuds",
    name: "Wireless Earbuds Pro (TWS)",
    originalPrice: 1_290_000,
    salePrice: 299_000,
  },
  {
    id: "prod-powerbank",
    name: "Power Bank 10,000 mAh",
    originalPrice: 450_000,
    salePrice: 199_000,
  },
  {
    id: "prod-smartwatch",
    name: "Smartwatch S2",
    originalPrice: 2_490_000,
    salePrice: 990_000,
  },
];

const initialInventory: readonly InventoryItem[] = [
  { id: "inv-earbuds", productId: "prod-earbuds", stock: 5, status: "available", version: 0 },
  { id: "inv-powerbank", productId: "prod-powerbank", stock: 10, status: "available", version: 0 },
  { id: "inv-smartwatch", productId: "prod-smartwatch", stock: 3, status: "available", version: 0 },
];

export const saleScenario: SaleScenario = {
  id: "vn-11-11-midnight-flash-sale",
  name: "Vietnam 11.11 Midnight Flash Sale",
  description:
    "Two-hour midnight flash sale on 11.11 with three heavily discounted products and very limited stock.",
  timeZone: "Asia/Ho_Chi_Minh",
  startsAt: Date.parse("2026-11-11T00:00:00+07:00"),
  endsAt: Date.parse("2026-11-11T02:00:00+07:00"),
  reservationTtlMs: 2 * 60 * 1000, // a buyer has 2 minutes to check out
  products,
  initialInventory,
};
