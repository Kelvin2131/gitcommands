import { describe, expect, it } from "vitest";
import {
  assertProductsBelongToClient,
  assertSameBin,
  deltaForCycleCount,
  nextQuantity,
  planPick,
  planTransfer,
  restockSuggestion,
  stockValueCents,
} from "@/lib/inventory";
import { assertTransition } from "@/lib/order-status";

describe("inventory movements", () => {
  it("receives and refuses a negative bin", () => {
    expect(nextQuantity(4, 3)).toBe(7);
    expect(() => nextQuantity(2, -3)).toThrow(/negative/);
    expect(() => nextQuantity(1, 100_001)).toThrow(/too large/);
  });

  it("turns a cycle count into a delta", () => {
    expect(deltaForCycleCount(10, 8)).toBe(-2);
    expect(deltaForCycleCount(10, 10)).toBe(0);
    expect(nextQuantity(10, deltaForCycleCount(10, 8))).toBe(8);
  });

  it("plans a transfer that nets to zero", () => {
    const move = planTransfer(4);
    expect(move.out + move.inn).toBe(0);
    expect(() => assertSameBin("a", "a")).toThrow(/different bin/);
  });

  it("plans a pick without taking more than the order or the bin", () => {
    expect(planPick({ onHand: 5, ordered: 3, alreadyPicked: 1, qty: 2 })).toEqual({
      pickQty: 2,
      linePicked: 3,
      done: true,
    });
    expect(() => planPick({ onHand: 1, ordered: 3, alreadyPicked: 0, qty: 2 })).toThrow(/negative/);
    expect(() => planPick({ onHand: 5, ordered: 3, alreadyPicked: 2, qty: 2 })).toThrow(/only needs 1/);
  });

  it("suggests a restock and values stock in cents", () => {
    expect(restockSuggestion(3, 12, 24)).toEqual({ shortfall: 9, suggest: 24 });
    expect(restockSuggestion(20, 12, 24)).toBeNull();
    expect(stockValueCents([{ qty: 3, costCents: 180 }, { qty: 2, costCents: 50 }])).toBe(640);
  });

  it("keeps a product on its own client", () => {
    expect(() => assertProductsBelongToClient("a", [{ clientId: "b", sku: "MUG" }])).toThrow(/MUG/);
    expect(() => assertProductsBelongToClient("a", [{ clientId: "a" }])).not.toThrow();
  });

  it("follows the pick pack ship path", () => {
    expect(() => assertTransition("IMPORTED", "PICKING")).not.toThrow();
    expect(() => assertTransition("PICKING", "PACKED")).not.toThrow();
    expect(() => assertTransition("PACKED", "SHIPPED")).not.toThrow();
    expect(() => assertTransition("SHIPPED", "RETURNED")).not.toThrow();
    expect(() => assertTransition("PACKED", "CANCELLED")).not.toThrow();
    expect(() => assertTransition("SHIPPED", "PICKING")).toThrow(/cannot go/);
  });
});
