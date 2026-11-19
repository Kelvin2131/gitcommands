import { DeskError } from "@/lib/errors";
import { storageChargeCents, sumCents } from "@/lib/money";

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
  pickFeeCents: number;
  packFeeCents: number;
  labelBilledCents: number;
};

export type InvoiceLineDraft = {
  kind: "STORAGE" | "PICK" | "PACK" | "LABEL";
  description: string;
  qty: number;
  unitCents: number;
  amountCents: number;
};

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
    if (order.pickFeeCents > 0) {
      lines.push({
        kind: "PICK",
        description: `Pick ${order.externalRef} (${order.units} units)`,
        qty: order.units,
        unitCents: order.units > 0 ? Math.round(order.pickFeeCents / order.units) : order.pickFeeCents,
        amountCents: order.pickFeeCents,
      });
    }
    if (order.packFeeCents > 0) {
      lines.push({
        kind: "PACK",
        description: `Pack ${order.externalRef}`,
        qty: 1,
        unitCents: order.packFeeCents,
        amountCents: order.packFeeCents,
      });
    }
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
