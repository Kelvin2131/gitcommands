import { DeskError } from "@/lib/errors";
import { lineAmountCents, storageChargeCents, sumCents } from "@/lib/money";

export type StorageInput = {
  sku: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  qty: number;
};

export type ShippedOrderInput = {
  externalRef: string;
  units: number;
  /** Boxes the order shipped in. The pack line quantity is this number. */
  boxCount: number;
  /** Pick fee captured on the order, already multiplied by units. */
  pickFeeCents: number;
  /** Box fee captured on the order: boxes × the per-box rate at pack time. */
  packFeeCents: number;
  labelBilledCents: number;
  /** Cancelled orders are not billed, even if a fee was captured and not cleared. */
  cancelled?: boolean;
};

export type InvoiceLineDraft = {
  kind: "STORAGE" | "PICK" | "PACK" | "LABEL";
  description: string;
  qty: number;
  unitCents: number;
  amountCents: number;
};

export const MAX_BOXES = 100;

export function assertBoxCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BOXES) {
    throw new DeskError(`Boxes must be a whole number from 1 to ${MAX_BOXES}.`);
  }
  return value;
}

/** Total box fee for an order. `feePerBoxCents` is the client's per-box rate. */
export function packFeeForBoxes(boxCount: number, feePerBoxCents: number): number {
  const total = lineAmountCents(assertBoxCount(boxCount), feePerBoxCents);
  if (total > 2_000_000_000) throw new DeskError("The box fee is too large to store.");
  return total;
}

/**
 * Rate frozen when the order was packed.
 * Later edits to the box count keep this rate, so a client price change does not rewrite the order.
 * If the stored total cannot be split evenly, fall back to the client's current rate.
 */
export function capturedBoxRateCents(totalCents: number, boxCount: number, clientFeePerBoxCents: number): number {
  if (
    Number.isInteger(boxCount) &&
    boxCount >= 1 &&
    Number.isInteger(totalCents) &&
    totalCents >= 0 &&
    totalCents % boxCount === 0
  ) {
    return totalCents / boxCount;
  }
  if (!Number.isInteger(clientFeePerBoxCents) || clientFeePerBoxCents < 0) {
    throw new DeskError("The box fee is not a valid amount.");
  }
  return clientFeePerBoxCents;
}

/** Fees and parcel fields written when an order is cancelled or unpacked. Nothing left to invoice. */
export function clearedShipmentFees() {
  return {
    boxCount: 1,
    pickFeeCents: 0,
    packFeeCents: 0,
    labelCostCents: 0,
    labelBilledCents: 0,
    trackingNumber: "",
    trackingNumbers: "",
    carrier: "",
    labelVendor: "",
  };
}

export function trackingNumbersOf(trackingNumbers: string, trackingNumber: string): string[] {
  const listed = trackingNumbers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (listed.length > 0) return listed;
  const single = trackingNumber.trim();
  return single ? [single] : [];
}

/**
 * One tracking number per box, up to `boxCount`.
 * A one-box order needs exactly one number. Extra boxes may be left blank.
 */
export function parseTrackingNumbers(values: string[], boxCount: number): string[] {
  const boxes = assertBoxCount(boxCount);
  const numbers = values.map((value) => value.trim()).filter(Boolean);
  if (numbers.length < 1) throw new DeskError("Enter the tracking number.");
  if (numbers.length > boxes) {
    const noun = boxes === 1 ? "box" : "boxes";
    throw new DeskError(`This order has ${boxes} ${noun}. Enter at most one tracking number per box.`);
  }
  for (const number of numbers) {
    if (number.length < 4 || number.length > 80) {
      throw new DeskError("Each tracking number must be 4 to 80 characters.");
    }
    if (/\s/.test(number)) throw new DeskError("A tracking number cannot contain spaces.");
  }
  const seen = new Set<string>();
  for (const number of numbers) {
    const key = number.toLowerCase();
    if (seen.has(key)) throw new DeskError("Each box needs its own tracking number.");
    seen.add(key);
  }
  return numbers;
}

export function joinTrackingNumbers(numbers: string[]): { trackingNumber: string; trackingNumbers: string } {
  return {
    trackingNumber: numbers[0] ?? "",
    trackingNumbers: numbers.join("\n"),
  };
}

function packLine(order: ShippedOrderInput): InvoiceLineDraft {
  const boxes = order.boxCount;
  if (!Number.isInteger(boxes) || boxes < 1) {
    throw new DeskError(`Order ${order.externalRef} has no box count.`);
  }
  if (order.packFeeCents % boxes !== 0) {
    throw new DeskError(`Order ${order.externalRef} box fee does not divide across ${boxes} boxes.`);
  }
  const noun = boxes === 1 ? "box" : "boxes";
  return {
    kind: "PACK",
    description: `Box fee ${order.externalRef} (${boxes} ${noun})`,
    qty: boxes,
    unitCents: order.packFeeCents / boxes,
    amountCents: order.packFeeCents,
  };
}

export function buildInvoiceAmounts(input: {
  days: number;
  centsPerCuFtMonth: number;
  storage: StorageInput[];
  orders: ShippedOrderInput[];
}): {
  lines: InvoiceLineDraft[];
  storageCents: number;
  pickPackCents: number;
  labelCents: number;
  totalCents: number;
} {
  if (!Number.isInteger(input.days) || input.days < 1) throw new DeskError("The invoice period is not valid.");
  const lines: InvoiceLineDraft[] = [];
  for (const item of input.storage) {
    const amount = storageChargeCents({
      lengthMm: item.lengthMm,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      qty: item.qty,
      days: input.days,
      centsPerCuFtMonth: input.centsPerCuFtMonth,
    });
    if (amount === 0) continue;
    lines.push({
      kind: "STORAGE",
      description: `Storage ${item.sku} ${item.name} × ${item.qty} for ${input.days} days`,
      qty: item.qty,
      unitCents: item.qty > 0 ? Math.round(amount / item.qty) : amount,
      amountCents: amount,
    });
  }
  for (const order of input.orders) {
    if (order.cancelled) continue;
    if (order.pickFeeCents > 0) {
      lines.push({
        kind: "PICK",
        description: `Pick ${order.externalRef} (${order.units} units)`,
        qty: order.units,
        unitCents: order.units > 0 ? Math.round(order.pickFeeCents / order.units) : order.pickFeeCents,
        amountCents: order.pickFeeCents,
      });
    }
    if (order.packFeeCents > 0) lines.push(packLine(order));
    if (order.labelBilledCents > 0) {
      lines.push({
        kind: "LABEL",
        description: `Label ${order.externalRef}`,
        qty: 1,
        unitCents: order.labelBilledCents,
        amountCents: order.labelBilledCents,
      });
    }
  }
  const storageCents = sumCents(lines.filter((line) => line.kind === "STORAGE").map((line) => line.amountCents));
  const pickPackCents = sumCents(
    lines.filter((line) => line.kind === "PICK" || line.kind === "PACK").map((line) => line.amountCents),
  );
  const labelCents = sumCents(lines.filter((line) => line.kind === "LABEL").map((line) => line.amountCents));
  const totalCents = sumCents([storageCents, pickPackCents, labelCents]);
  return { lines, storageCents, pickPackCents, labelCents, totalCents };
}
