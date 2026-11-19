import { describe, expect, it } from "vitest";
import {
  buildInvoiceAmounts,
  capturedBoxRateCents,
  clearedShipmentFees,
  packFeeForBoxes,
  parseTrackingNumbers,
  type ShippedOrderInput,
} from "@/lib/billing";

function invoice(orders: ShippedOrderInput[]) {
  return buildInvoiceAmounts({
    days: 30,
    centsPerCuFtMonth: 0,
    storage: [],
    orders,
  });
}

const quiet = { units: 3, pickFeeCents: 0, labelBilledCents: 0 };

describe("box fees", () => {
  it("bills one box at the client's per-box fee", () => {
    expect(packFeeForBoxes(1, 200)).toBe(200);
    const draft = invoice([{ externalRef: "A1", boxCount: 1, packFeeCents: 200, ...quiet }]);
    expect(draft.lines).toEqual([
      {
        kind: "PACK",
        description: "Box fee A1 (1 box)",
        qty: 1,
        unitCents: 200,
        amountCents: 200,
      },
    ]);
    expect(draft.pickPackCents).toBe(200);
    expect(draft.totalCents).toBe(200);
  });

  it("bills two boxes as quantity times the captured per-box fee", () => {
    expect(capturedBoxRateCents(200, 1, 999)).toBe(200);
    const total = packFeeForBoxes(2, capturedBoxRateCents(200, 1, 999));
    expect(total).toBe(400);
    const draft = invoice([{ externalRef: "A2", boxCount: 2, packFeeCents: total, ...quiet }]);
    expect(draft.lines).toEqual([
      {
        kind: "PACK",
        description: "Box fee A2 (2 boxes)",
        qty: 2,
        unitCents: 200,
        amountCents: 400,
      },
    ]);
    expect(draft.pickPackCents).toBe(400);
    expect(draft.totalCents).toBe(400);
  });

  it("bills a cancelled order at $0, including one whose fees were not cleared yet", () => {
    const stale = invoice([
      {
        externalRef: "A3",
        units: 4,
        boxCount: 2,
        pickFeeCents: 300,
        packFeeCents: 400,
        labelBilledCents: 525,
        cancelled: true,
      },
    ]);
    expect(stale.lines).toEqual([]);
    expect(stale.pickPackCents).toBe(0);
    expect(stale.labelCents).toBe(0);
    expect(stale.totalCents).toBe(0);

    const cleared = clearedShipmentFees();
    expect(cleared.pickFeeCents).toBe(0);
    expect(cleared.packFeeCents).toBe(0);
    expect(cleared.labelBilledCents).toBe(0);
    expect(cleared.labelCostCents).toBe(0);
    expect(cleared.boxCount).toBe(1);
    const wiped = invoice([
      {
        externalRef: "A3",
        units: 4,
        boxCount: cleared.boxCount,
        pickFeeCents: cleared.pickFeeCents,
        packFeeCents: cleared.packFeeCents,
        labelBilledCents: cleared.labelBilledCents,
      },
    ]);
    expect(wiped.lines).toEqual([]);
    expect(wiped.totalCents).toBe(0);
  });

  it("rejects a box count below 1", () => {
    expect(() => packFeeForBoxes(0, 200)).toThrow(/Boxes/);
    expect(() => packFeeForBoxes(1.5, 200)).toThrow(/whole number/);
  });

  it("accepts one tracking number per box and still allows a single number", () => {
    expect(parseTrackingNumbers(["1Z999DEMO"], 1)).toEqual(["1Z999DEMO"]);
    expect(parseTrackingNumbers(["1Z111", "1Z222"], 2)).toEqual(["1Z111", "1Z222"]);
    expect(parseTrackingNumbers(["1Z111", ""], 2)).toEqual(["1Z111"]);
    expect(() => parseTrackingNumbers(["", ""], 2)).toThrow(/tracking number/);
    expect(() => parseTrackingNumbers(["1Z111", "1Z222", "1Z333"], 2)).toThrow(/at most/);
    expect(() => parseTrackingNumbers(["1Z111", "1z111"], 2)).toThrow(/own tracking number/);
  });
});
