import { describe, expect, it } from "vitest";
import { buildInvoiceAmounts } from "@/lib/billing";
import {
  applyMarkupBps,
  dollarsToCents,
  formatCents,
  lineAmountCents,
  storageChargeCents,
  sumCents,
} from "@/lib/money";

describe("money", () => {
  it("adds cents without floating point drift", () => {
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(dollarsToCents("0.10") + dollarsToCents("0.20")).toBe(30);
    expect(dollarsToCents("12.5")).toBe(1250);
    expect(dollarsToCents("12.50")).toBe(1250);
    expect(() => dollarsToCents("12.345")).toThrow(/12\.50/);
  });

  it("multiplies a line in integers", () => {
    expect(lineAmountCents(3, 75)).toBe(225);
    expect(() => lineAmountCents(1.5, 75)).toThrow(/whole number/);
  });

  it("marks up a label by basis points", () => {
    expect(applyMarkupBps(1000, 500)).toBe(1050);
    expect(applyMarkupBps(1, 5000)).toBe(2);
    expect(applyMarkupBps(612, 0)).toBe(612);
  });

  it("charges storage from millimetres with half-up rounding", () => {
    expect(
      storageChargeCents({
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
        qty: 2,
        days: 30,
        centsPerCuFtMonth: 1000,
      }),
    ).toBe(71);
    expect(storageChargeCents({ lengthMm: 0, widthMm: 10, heightMm: 10, qty: 5, days: 30, centsPerCuFtMonth: 1000 })).toBe(0);
  });

  it("formats and totals an invoice from those parts", () => {
    const draft = buildInvoiceAmounts({
      days: 30,
      centsPerCuFtMonth: 1000,
      storage: [{ sku: "BOX", name: "Box", lengthMm: 100, widthMm: 100, heightMm: 100, qty: 2 }],
      orders: [{ externalRef: "A1", units: 2, boxCount: 1, pickFeeCents: 150, packFeeCents: 200, labelBilledCents: 525 }],
    });
    expect(draft.storageCents).toBe(71);
    expect(draft.pickPackCents).toBe(350);
    expect(draft.labelCents).toBe(525);
    expect(draft.totalCents).toBe(71 + 350 + 525);
    expect(formatCents(draft.totalCents)).toBe("$9.46");
  });
});
