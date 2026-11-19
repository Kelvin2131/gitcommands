import type { Channel, Prisma } from "@prisma/client";
import { buildInvoiceAmounts } from "@/lib/billing";
import {
  groupOrderRows,
  parseOrderCsv,
  parseProductCsv,
  parseStockCsv,
  type CsvIssue,
} from "@/lib/csv";
import { periodBounds, parseZonedDate } from "@/lib/dates";
import { db, isUniqueConflict, type Tx } from "@/lib/db";
import { DeskError, ScopeError } from "@/lib/errors";
import {
  assertProductsBelongToClient,
  assertSameBin,
  deltaForCycleCount,
  planPick,
  planTransfer,
} from "@/lib/inventory";
import { applyMarkupBps, dollarsToCents, lineAmountCents } from "@/lib/money";
import { assertTransition, type OrderStatusName } from "@/lib/order-status";
import { isPublicHttpUrl } from "@/lib/photos";
import { applyStockChange, withStockRetry } from "@/lib/stock-store";

export type ImportReport = { imported: number; skipped: number; errors: CsvIssue[] };

const codePattern = /^[A-Z0-9][A-Z0-9-]{1,11}$/;
const skuPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export function normalizeCode(code: string): string {
  const value = code.trim().toUpperCase();
  if (!codePattern.test(value)) throw new DeskError("Use 2–12 letters or numbers for the code.");
  return value;
}

function cleanSku(sku: string): string {
  const value = sku.trim();
  if (!skuPattern.test(value)) throw new DeskError("SKU can use letters, numbers, dots, and dashes.");
  return value;
}

function cleanPhoto(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    if (!/^\/[A-Za-z0-9/_.-]+$/.test(trimmed)) throw new DeskError("That photo path is not valid.");
    return trimmed;
  }
  if (!isPublicHttpUrl(trimmed)) throw new DeskError("Use a public https photo link.");
  return trimmed;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new DeskError(`${label} must be a whole number from 0 to 1,000,000.`);
  }
  return value;
}

async function recordImport(kind: string, userId: string, filename: string, report: ImportReport) {
  await db.importRun.create({
    data: {
      kind,
      userId,
      filename: filename.slice(0, 120),
      okCount: report.imported,
      errorCount: report.errors.length + report.skipped,
      errors: JSON.stringify(report.errors.slice(0, 50)),
    },
  });
}

export async function saveClient(
  actorId: string,
  input: {
    id?: string;
    name: string;
    code: string;
    contactName: string;
    email: string;
    phone: string;
    notes: string;
    pickFeeCents: number;
    packFeeCents: number;
    storageCentsPerCuFtMonth: number;
    labelMarkupBps: number;
    active: boolean;
  },
) {
  const name = input.name.trim();
  if (name.length < 2) throw new DeskError("Enter the client name.");
  const code = normalizeCode(input.code);
  for (const [label, value] of [
    ["Pick fee", input.pickFeeCents],
    ["Pack fee", input.packFeeCents],
    ["Storage rate", input.storageCentsPerCuFtMonth],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
      throw new DeskError(`${label} is not a valid amount.`);
    }
  }
  if (!Number.isInteger(input.labelMarkupBps) || input.labelMarkupBps < 0 || input.labelMarkupBps > 10000) {
    throw new DeskError("Label markup must be between 0 and 100 percent.");
  }
  const data = {
    name,
    code,
    contactName: input.contactName.trim().slice(0, 80),
    email: input.email.trim().slice(0, 120),
    phone: input.phone.trim().slice(0, 40),
    notes: input.notes.trim().slice(0, 500),
    pickFeeCents: input.pickFeeCents,
    packFeeCents: input.packFeeCents,
    storageCentsPerCuFtMonth: input.storageCentsPerCuFtMonth,
    labelMarkupBps: input.labelMarkupBps,
    active: input.active,
  };
  if (input.id) {
    const existing = await db.client.findUnique({ where: { id: input.id } });
    if (!existing) throw new DeskError("That client is not on the desk.");
    try {
      await db.client.update({ where: { id: existing.id }, data });
    } catch (error) {
      if (isUniqueConflict(error)) throw new DeskError("That client code is already used.");
      throw error;
    }
  } else {
    try {
      await db.client.create({ data });
    } catch (error) {
      if (isUniqueConflict(error)) throw new DeskError("That client code is already used.");
      throw error;
    }
  }
  await db.accountAudit.create({ data: { actorId, action: "client-saved", detail: code } });
}

export async function saveLocation(input: { code: string; name: string; kind: string }) {
  const code = normalizeCode(input.code);
  const name = input.name.trim();
  if (name.length < 2) throw new DeskError("Name the bin.");
  const kind = ["RECEIVING", "STORAGE", "PACK", "SHIP"].includes(input.kind) ? input.kind : "STORAGE";
  try {
    await db.location.create({ data: { code, name, kind } });
  } catch (error) {
    if (isUniqueConflict(error)) throw new DeskError("That bin code is already used.");
    throw error;
  }
}

export async function saveProduct(
  input: {
    id?: string;
    clientId: string;
    sku: string;
    name: string;
    barcode: string;
    description: string;
    photoUrl: string;
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    weightGrams: number;
    costCents: number;
    reorderPoint: number;
    reorderQty: number;
    active: boolean;
  },
  allowCost: boolean,
) {
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new DeskError("Choose a client.");
  const sku = cleanSku(input.sku);
  const name = input.name.trim();
  if (name.length < 2) throw new DeskError("Enter the product name.");
  const data = {
    clientId: client.id,
    sku,
    name,
    barcode: input.barcode.trim().slice(0, 64),
    description: input.description.trim().slice(0, 500),
    photoUrl: cleanPhoto(input.photoUrl),
    lengthMm: nonNegative(input.lengthMm, "Length"),
    widthMm: nonNegative(input.widthMm, "Width"),
    heightMm: nonNegative(input.heightMm, "Height"),
    weightGrams: nonNegative(input.weightGrams, "Weight"),
    reorderPoint: nonNegative(input.reorderPoint, "Reorder point"),
    reorderQty: nonNegative(input.reorderQty, "Reorder quantity"),
    active: input.active,
  };
  if (input.id) {
    const existing = await db.product.findUnique({ where: { id: input.id } });
    if (!existing) throw new DeskError("That product is not on the desk.");
    if (existing.clientId !== client.id) throw new ScopeError("That product belongs to a different client.");
    try {
      await db.product.update({
        where: { id: existing.id },
        data: allowCost ? { ...data, costCents: nonNegative(input.costCents, "Cost") } : data,
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw new DeskError(`${client.code} already has SKU ${sku}.`);
      throw error;
    }
    return existing.id;
  }
  try {
    const created = await db.product.create({
      data: { ...data, costCents: allowCost ? nonNegative(input.costCents, "Cost") : 0 },
    });
    return created.id;
  } catch (error) {
    if (isUniqueConflict(error)) throw new DeskError(`${client.code} already has SKU ${sku}.`);
    throw error;
  }
}

async function productsByScan(scan: string) {
  const text = scan.trim();
  if (!text) throw new DeskError("Scan a barcode or type a SKU.");
  return db.product.findMany({
    where: {
      active: true,
      OR: [{ barcode: text }, { sku: { equals: text, mode: "insensitive" } }],
    },
    include: { client: true },
    take: 8,
  });
}

export async function receiveStock(
  userId: string,
  input: { scan: string; qty: number; locationId: string; clientId?: string; shipmentId?: string },
) {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new DeskError("Receive at least 1.");
  const matches = await productsByScan(input.scan);
  const narrowed = input.clientId ? matches.filter((product) => product.clientId === input.clientId) : matches;
  if (narrowed.length === 0) throw new DeskError("Nothing on the shelf matches that scan for this client.");
  if (narrowed.length > 1) {
    throw new DeskError("That scan matches more than one client. Choose the client, then scan again.");
  }
  const product = narrowed[0];
  if (!product) throw new DeskError("Nothing on the shelf matches that scan for this client.");
  await withStockRetry((tx) =>
    receiveInTx(tx, userId, product.id, product.clientId, input.locationId, input.qty, input.shipmentId),
  );
  return product;
}

async function receiveInTx(
  tx: Tx,
  userId: string,
  productId: string,
  clientId: string,
  locationId: string,
  qty: number,
  shipmentId?: string,
) {
  let note = "Received onto the shelf";
  if (shipmentId) {
    const shipment = await tx.inboundShipment.findFirst({ where: { id: shipmentId, clientId } });
    if (!shipment) throw new ScopeError("That shipment belongs to a different client.");
    if (shipment.status === "CLOSED") throw new DeskError("That shipment is closed.");
    const line = await tx.inboundLine.findFirst({ where: { shipmentId: shipment.id, productId } });
    if (line) {
      await tx.inboundLine.update({ where: { id: line.id }, data: { receivedQty: { increment: qty } } });
    } else {
      await tx.inboundLine.create({
        data: { shipmentId: shipment.id, productId, expectedQty: 0, receivedQty: qty },
      });
    }
    if (shipment.status === "EXPECTED") {
      await tx.inboundShipment.update({
        where: { id: shipment.id },
        data: { status: "RECEIVING", arrivedAt: shipment.arrivedAt ?? new Date() },
      });
    }
    note = `Inbound ${shipment.reference}`;
  }
  await applyStockChange(tx, {
    productId,
    locationId,
    delta: qty,
    reason: "RECEIVE",
    userId,
    note,
    expectedClientId: clientId,
    referenceType: shipmentId ? "inbound" : "",
    referenceId: shipmentId ?? "",
  });
}

export async function adjustStock(userId: string, input: { productId: string; locationId: string; delta: number; note: string }) {
  const note = input.note.trim();
  if (note.length < 3) throw new DeskError("Write a short reason for the adjustment.");
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new DeskError("Enter how many to add or remove.");
  await withStockRetry((tx) =>
    applyStockChange(tx, {
      productId: input.productId,
      locationId: input.locationId,
      delta: input.delta,
      reason: "ADJUST",
      userId,
      note,
    }),
  );
}

export async function countByScan(
  userId: string,
  input: { scan: string; locationId: string; counted: number; clientId?: string },
) {
  const matches = await productsByScan(input.scan);
  const narrowed = input.clientId ? matches.filter((product) => product.clientId === input.clientId) : matches;
  if (narrowed.length !== 1) {
    throw new DeskError(
      narrowed.length === 0
        ? "Nothing matches that scan."
        : "That scan matches more than one client. Choose the client.",
    );
  }
  const product = narrowed[0];
  if (!product) throw new DeskError("Nothing matches that scan.");
  await cycleCount(userId, { productId: product.id, locationId: input.locationId, counted: input.counted });
  return product;
}

export async function cycleCount(userId: string, input: { productId: string; locationId: string; counted: number }) {
  await withStockRetry(async (tx) => {
    const balance = await tx.inventoryBalance.findUnique({
      where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    });
    const delta = deltaForCycleCount(balance?.qty ?? 0, input.counted);
    await applyStockChange(tx, {
      productId: input.productId,
      locationId: input.locationId,
      delta,
      reason: "CYCLE_COUNT",
      userId,
      note: `Counted ${input.counted}`,
    });
  });
}

export async function transferStock(
  userId: string,
  input: { productId: string; fromId: string; toId: string; qty: number },
) {
  assertSameBin(input.fromId, input.toId);
  const move = planTransfer(input.qty);
  const referenceId = `move-${Date.now()}`;
  await withStockRetry(async (tx) => {
    await applyStockChange(tx, {
      productId: input.productId,
      locationId: input.fromId,
      delta: move.out,
      reason: "TRANSFER",
      userId,
      note: "Moved out",
      referenceType: "transfer",
      referenceId,
    });
    await applyStockChange(tx, {
      productId: input.productId,
      locationId: input.toId,
      delta: move.inn,
      reason: "TRANSFER",
      userId,
      note: "Moved in",
      referenceType: "transfer",
      referenceId,
    });
  });
}

export async function createInbound(input: { clientId: string; reference: string; notes: string }) {
  const reference = input.reference.trim();
  if (reference.length < 2) throw new DeskError("Enter the shipment reference.");
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new DeskError("Choose a client.");
  try {
    return await db.inboundShipment.create({
      data: { clientId: client.id, reference: reference.slice(0, 40), notes: input.notes.trim().slice(0, 300) },
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new DeskError("That client already has this shipment reference.");
    throw error;
  }
}

export async function addInboundExpectation(input: { shipmentId: string; sku: string; qty: number }) {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new DeskError("Expected quantity must be at least 1.");
  const shipment = await db.inboundShipment.findUnique({ where: { id: input.shipmentId } });
  if (!shipment) throw new DeskError("That shipment is not on the desk.");
  if (shipment.status === "CLOSED") throw new DeskError("That shipment is closed.");
  const product = await db.product.findFirst({
    where: { clientId: shipment.clientId, sku: { equals: input.sku.trim(), mode: "insensitive" } },
  });
  if (!product) throw new ScopeError("That SKU is not on this client's list.");
  const existing = await db.inboundLine.findFirst({ where: { shipmentId: shipment.id, productId: product.id } });
  if (existing) {
    await db.inboundLine.update({ where: { id: existing.id }, data: { expectedQty: input.qty } });
  } else {
    await db.inboundLine.create({
      data: { shipmentId: shipment.id, productId: product.id, expectedQty: input.qty },
    });
  }
}

export async function closeInbound(shipmentId: string) {
  const shipment = await db.inboundShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new DeskError("That shipment is not on the desk.");
  await db.inboundShipment.update({ where: { id: shipment.id }, data: { status: "CLOSED" } });
}

async function loadOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { lines: { include: { product: true } }, client: true },
  });
  if (!order) throw new DeskError("That order is not on the desk.");
  assertProductsBelongToClient(
    order.clientId,
    order.lines.map((line) => line.product),
  );
  return order;
}

export async function createOrder(input: {
  clientId: string;
  externalRef: string;
  channel: Channel;
  customerName: string;
  shipLine1: string;
  shipCity: string;
  shipRegion: string;
  shipPostal: string;
  shipCountry: string;
  shipBy: Date | null;
  lines: { productId: string; qty: number }[];
}) {
  if (input.lines.length === 0) throw new DeskError("Add at least one product.");
  const products = await db.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) } } });
  assertProductsBelongToClient(input.clientId, products);
  if (products.length !== new Set(input.lines.map((line) => line.productId)).size) {
    throw new DeskError("One of those products is missing.");
  }
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new DeskError("Each line needs a quantity of at least 1.");
  }
  const ref = input.externalRef.trim();
  if (ref.length < 2) throw new DeskError("Enter the order number.");
  try {
    return await db.order.create({
      data: {
        clientId: input.clientId,
        externalRef: ref.slice(0, 40),
        channel: input.channel,
        customerName: input.customerName.trim().slice(0, 120),
        shipLine1: input.shipLine1.trim().slice(0, 160),
        shipCity: input.shipCity.trim().slice(0, 80),
        shipRegion: input.shipRegion.trim().slice(0, 40),
        shipPostal: input.shipPostal.trim().slice(0, 20),
        shipCountry: (input.shipCountry.trim() || "US").slice(0, 2).toUpperCase(),
        shipBy: input.shipBy,
        lines: { create: input.lines.map((line) => ({ productId: line.productId, qty: line.qty })) },
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new DeskError("That order number is already imported for this client.");
    throw error;
  }
}

export async function pickOrder(
  userId: string,
  input: { orderId: string; scan: string; qty: number; locationId?: string },
) {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new DeskError("Pick at least 1.");
  const scan = input.scan.trim();
  await withStockRetry(async (tx) => {
    const order = await loadOrder(tx, input.orderId);
    if (order.status === "CANCELLED" || order.status === "SHIPPED" || order.status === "RETURNED") {
      throw new DeskError("That order is already finished.");
    }
    if (order.status === "PACKED") throw new DeskError("Unpack the order before picking more.");
    if (order.status === "IMPORTED") {
      assertTransition("IMPORTED", "PICKING");
      await tx.order.update({ where: { id: order.id }, data: { status: "PICKING" } });
    }
    const line = order.lines.find(
      (item) => item.product.barcode === scan || item.product.sku.toLowerCase() === scan.toLowerCase(),
    );
    if (!line) throw new DeskError("That scan is not on this order.");
    let locationId = input.locationId || "";
    if (!locationId) {
      const bin = await tx.inventoryBalance.findFirst({
        where: { productId: line.productId, qty: { gt: 0 } },
        orderBy: { qty: "desc" },
      });
      if (!bin) throw new DeskError("That product is not in a bin. Receive it first.");
      locationId = bin.locationId;
    }
    const balance = await tx.inventoryBalance.findUnique({
      where: { productId_locationId: { productId: line.productId, locationId } },
    });
    const plan = planPick({
      onHand: balance?.qty ?? 0,
      ordered: line.qty,
      alreadyPicked: line.pickedQty,
      qty: input.qty,
    });
    await applyStockChange(tx, {
      productId: line.productId,
      locationId,
      delta: -plan.pickQty,
      reason: "PICK",
      userId,
      note: order.externalRef,
      referenceType: "order",
      referenceId: order.id,
      expectedClientId: order.clientId,
    });
    await tx.orderLine.update({ where: { id: line.id }, data: { pickedQty: plan.linePicked } });
  });
}

export async function packOrder(orderId: string) {
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertTransition(order.status as OrderStatusName, "PACKED");
    if (order.lines.some((line) => line.pickedQty !== line.qty)) {
      throw new DeskError("Pick every unit before packing.");
    }
    const units = order.lines.reduce((sum, line) => sum + line.qty, 0);
    const pickFeeCents = lineAmountCents(units, order.client.pickFeeCents);
    if (pickFeeCents > 2_000_000_000) throw new DeskError("The pick fee is too large to store.");
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PACKED", pickFeeCents, packFeeCents: order.client.packFeeCents },
    });
  });
}

export async function unpackOrder(orderId: string) {
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertTransition(order.status as OrderStatusName, "PICKING");
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PICKING", pickFeeCents: 0, packFeeCents: 0 },
    });
  });
}

export async function shipOrder(
  orderId: string,
  input: { trackingNumber: string; carrier: string; labelVendor: string; labelCostCents: number },
) {
  const trackingNumber = input.trackingNumber.trim();
  const carrier = input.carrier.trim();
  const labelVendor = input.labelVendor.trim();
  if (trackingNumber.length < 4) throw new DeskError("Enter the tracking number.");
  if (carrier.length < 2) throw new DeskError("Enter the carrier, such as UPS or USPS.");
  if (labelVendor.length < 2) throw new DeskError("Enter who sold the label, such as Pirate Ship.");
  if (!Number.isInteger(input.labelCostCents) || input.labelCostCents < 0) {
    throw new DeskError("Enter the label cost.");
  }
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertTransition(order.status as OrderStatusName, "SHIPPED");
    const labelBilledCents = applyMarkupBps(input.labelCostCents, order.client.labelMarkupBps);
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "SHIPPED",
        shippedAt: new Date(),
        trackingNumber: trackingNumber.slice(0, 80),
        carrier: carrier.slice(0, 40),
        labelVendor: labelVendor.slice(0, 40),
        labelCostCents: input.labelCostCents,
        labelBilledCents,
      },
    });
  });
}

export async function cancelOrder(userId: string, orderId: string, locationId: string) {
  await withStockRetry(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertTransition(order.status as OrderStatusName, "CANCELLED");
    const picked = order.lines.filter((line) => line.pickedQty > 0);
    if (picked.length > 0 && !locationId) throw new DeskError("Choose a bin to put the picked items back.");
    for (const line of picked) {
      await applyStockChange(tx, {
        productId: line.productId,
        locationId,
        delta: line.pickedQty,
        reason: "RETURN",
        userId,
        note: `Put back after cancelling ${order.externalRef}`,
        referenceType: "order",
        referenceId: order.id,
        expectedClientId: order.clientId,
      });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  });
}

export async function openReturn(input: { orderId: string; reason: string }) {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { lines: true },
  });
  if (!order) throw new DeskError("That order is not on the desk.");
  assertTransition(order.status as OrderStatusName, "RETURNED");
  return db.$transaction(async (tx) => {
    const created = await tx.return.create({
      data: {
        clientId: order.clientId,
        orderId: order.id,
        reason: input.reason.trim().slice(0, 200),
        lines: {
          create: order.lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        },
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "RETURNED" } });
    return created;
  });
}

export async function restockReturn(
  userId: string,
  input: { returnId: string; lineId: string; locationId: string; qty: number },
) {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new DeskError("Restock at least 1.");
  await withStockRetry(async (tx) => {
    const line = await tx.returnLine.findFirst({
      where: { id: input.lineId, returnId: input.returnId },
      include: { return: true, product: true },
    });
    if (!line) throw new DeskError("That return line is not on the desk.");
    if (line.return.status !== "OPEN") throw new DeskError("That return is already closed.");
    if (line.product.clientId !== line.return.clientId) {
      throw new ScopeError("That product belongs to a different client.");
    }
    if (line.restocked + input.qty > line.qty) {
      throw new DeskError(`Only ${line.qty - line.restocked} can still go back on the shelf.`);
    }
    await applyStockChange(tx, {
      productId: line.productId,
      locationId: input.locationId,
      delta: input.qty,
      reason: "RETURN",
      userId,
      note: "Customer return",
      referenceType: "return",
      referenceId: line.returnId,
      expectedClientId: line.return.clientId,
    });
    await tx.returnLine.update({ where: { id: line.id }, data: { restocked: { increment: input.qty } } });
  });
}

export async function closeReturn(returnId: string, mode: "restocked" | "discarded") {
  const row = await db.return.findUnique({ where: { id: returnId }, include: { lines: true } });
  if (!row) throw new DeskError("That return is not on the desk.");
  if (row.status !== "OPEN") throw new DeskError("That return is already closed.");
  const unfinished = row.lines.some((line) => line.restocked < line.qty);
  if (mode === "restocked" && unfinished) {
    throw new DeskError("Restock every unit, or close it as not restocked.");
  }
  await db.return.update({
    where: { id: row.id },
    data: { status: mode === "restocked" ? "RESTOCKED" : "DISCARDED" },
  });
}

async function nextInvoiceNumber(tx: Tx, when: Date): Promise<string> {
  const year = when.getUTCFullYear();
  const count = await tx.invoice.count({
    where: { number: { startsWith: `KAMO-${year}-` } },
  });
  return `KAMO-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createInvoice(clientId: string, startIso: string, endIso: string, timeZone: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new DeskError("Choose a client.");
  const bounds = periodBounds(startIso, endIso, timeZone);
  const existing = await db.invoice.findFirst({
    where: {
      clientId,
      status: { not: "VOID" },
      periodStart: bounds.start,
      periodEnd: bounds.end,
    },
  });
  if (existing) throw new DeskError(`Invoice ${existing.number} already covers that period.`);
  const [orders, products] = await Promise.all([
    db.order.findMany({
      where: {
        clientId,
        status: { in: ["SHIPPED", "RETURNED"] },
        shippedAt: { gte: bounds.start, lt: bounds.end },
      },
      include: { lines: true },
      orderBy: { shippedAt: "asc" },
    }),
    db.product.findMany({
      where: { clientId, active: true },
      include: { balances: true },
    }),
  ]);
  const draft = buildInvoiceAmounts({
    days: bounds.days,
    centsPerCuFtMonth: client.storageCentsPerCuFtMonth,
    storage: products
      .map((product) => ({
        sku: product.sku,
        name: product.name,
        lengthMm: product.lengthMm,
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        qty: product.balances.reduce((sum, balance) => sum + balance.qty, 0),
      }))
      .filter((product) => product.qty > 0),
    orders: orders.map((order) => ({
      externalRef: order.externalRef,
      units: order.lines.reduce((sum, line) => sum + line.qty, 0),
      pickFeeCents: order.pickFeeCents,
      packFeeCents: order.packFeeCents,
      labelBilledCents: order.labelBilledCents,
    })),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const number = await nextInvoiceNumber(tx, bounds.start);
        return tx.invoice.create({
          data: {
            clientId,
            number,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            storageCents: draft.storageCents,
            pickPackCents: draft.pickPackCents,
            labelCents: draft.labelCents,
            totalCents: draft.totalCents,
            lines: {
              create: draft.lines.map((line) => ({
                kind: line.kind,
                description: line.description.slice(0, 240),
                qty: line.qty,
                unitCents: line.unitCents,
                amountCents: line.amountCents,
              })),
            },
          },
        });
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  throw new DeskError("Could not number the invoice. Try again.");
}

export async function setInvoiceStatus(invoiceId: string, status: "ISSUED" | "PAID" | "VOID") {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new DeskError("That invoice is not on the desk.");
  if (invoice.status === "VOID" || invoice.status === "PAID") {
    throw new DeskError("That invoice is locked.");
  }
  if (status === "ISSUED" && invoice.status !== "DRAFT") throw new DeskError("Only a draft can be issued.");
  if (status === "PAID" && invoice.status !== "ISSUED") throw new DeskError("Issue the invoice before marking it paid.");
  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status,
      issuedAt: status === "ISSUED" ? new Date() : invoice.issuedAt,
      paidAt: status === "PAID" ? new Date() : invoice.paidAt,
    },
  });
}

export async function deleteDraftInvoice(invoiceId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new DeskError("That invoice is not on the desk.");
  if (invoice.status !== "DRAFT") throw new DeskError("Only a draft can be deleted.");
  await db.invoice.delete({ where: { id: invoice.id } });
}

export async function importProducts(userId: string, text: string, filename: string, allowCost: boolean): Promise<ImportReport> {
  const parsed = parseProductCsv(text);
  const report: ImportReport = { imported: 0, skipped: 0, errors: [...parsed.errors] };
  const clients = await db.client.findMany({ where: { code: { in: [...new Set(parsed.rows.map((row) => row.clientCode))] } } });
  const byCode = new Map(clients.map((client) => [client.code, client]));
  for (const row of parsed.rows) {
    if (report.errors.some((error) => error.row === row.row)) continue;
    const client = byCode.get(row.clientCode);
    if (!client) {
      report.errors.push({ row: row.row, message: `No client uses code ${row.clientCode}.` });
      continue;
    }
    try {
      const existing = await db.product.findUnique({
        where: { clientId_sku: { clientId: client.id, sku: row.sku } },
      });
      await saveProduct(
        {
          id: existing?.id,
          clientId: client.id,
          sku: row.sku,
          name: row.name,
          barcode: row.barcode,
          description: row.description,
          photoUrl: row.photoUrl,
          lengthMm: row.lengthMm,
          widthMm: row.widthMm,
          heightMm: row.heightMm,
          weightGrams: row.weightGrams,
          costCents: row.costCents,
          reorderPoint: row.reorderPoint,
          reorderQty: row.reorderQty,
          active: true,
        },
        allowCost,
      );
      report.imported += 1;
    } catch (error) {
      report.errors.push({ row: row.row, message: error instanceof DeskError ? error.message : "Could not save that row." });
    }
  }
  report.errors.sort((a, b) => a.row - b.row);
  await recordImport("products", userId, filename, report);
  return report;
}

export async function importStock(userId: string, text: string, filename: string): Promise<ImportReport> {
  const parsed = parseStockCsv(text);
  const report: ImportReport = { imported: 0, skipped: 0, errors: [...parsed.errors] };
  for (const row of parsed.rows) {
    if (report.errors.some((error) => error.row === row.row)) continue;
    try {
      const client = await db.client.findUnique({ where: { code: row.clientCode } });
      if (!client) throw new DeskError(`No client uses code ${row.clientCode}.`);
      const product = await db.product.findFirst({
        where: { clientId: client.id, sku: { equals: row.sku, mode: "insensitive" } },
      });
      if (!product) throw new ScopeError(`${row.sku} is not on ${client.code}'s list.`);
      const location = await db.location.findUnique({ where: { code: row.location } });
      if (!location || !location.active) throw new DeskError(`Bin ${row.location} is not on the floor.`);
      if (row.mode === "add") {
        if (row.qty < 1) throw new DeskError("Add at least 1.");
        await withStockRetry((tx) =>
          applyStockChange(tx, {
            productId: product.id,
            locationId: location.id,
            delta: row.qty,
            reason: "RECEIVE",
            userId,
            note: "CSV stock add",
            expectedClientId: client.id,
          }),
        );
      } else {
        await cycleCount(userId, { productId: product.id, locationId: location.id, counted: row.qty });
      }
      report.imported += 1;
    } catch (error) {
      report.errors.push({ row: row.row, message: error instanceof DeskError ? error.message : "Could not update stock." });
    }
  }
  report.errors.sort((a, b) => a.row - b.row);
  await recordImport("stock", userId, filename, report);
  return report;
}

export async function importOrders(userId: string, text: string, filename: string, timeZone: string): Promise<ImportReport> {
  void userId;
  const parsed = parseOrderCsv(text);
  const grouped = groupOrderRows(parsed.rows);
  const report: ImportReport = { imported: 0, skipped: 0, errors: [...parsed.errors, ...grouped.errors] };
  const badRows = new Set(report.errors.map((error) => error.row));
  for (const order of grouped.orders) {
    if (order.lines.some((line) => badRows.has(line.row)) || badRows.has(order.row)) {
      report.skipped += 1;
      continue;
    }
    try {
      const client = await db.client.findUnique({ where: { code: order.clientCode } });
      if (!client) throw new DeskError(`No client uses code ${order.clientCode}.`);
      const existing = await db.order.findUnique({
        where: { clientId_externalRef: { clientId: client.id, externalRef: order.externalRef } },
      });
      if (existing) {
        report.skipped += 1;
        report.errors.push({ row: order.row, message: `${order.externalRef} was already imported.` });
        continue;
      }
      const products = await db.product.findMany({
        where: { clientId: client.id, sku: { in: order.lines.map((line) => line.sku) } },
      });
      const bySku = new Map(products.map((product) => [product.sku.toLowerCase(), product]));
      const lines = order.lines.map((line) => {
        const product = bySku.get(line.sku.toLowerCase());
        if (!product) throw new ScopeError(`${line.sku} is not on ${client.code}'s list.`);
        return { productId: product.id, qty: line.qty };
      });
      await createOrder({
        clientId: client.id,
        externalRef: order.externalRef,
        channel: order.channel,
        customerName: order.customerName,
        shipLine1: order.shipLine1,
        shipCity: order.shipCity,
        shipRegion: order.shipRegion,
        shipPostal: order.shipPostal,
        shipCountry: order.shipCountry,
        shipBy: order.shipBy ? parseZonedDate(order.shipBy, timeZone) : null,
        lines,
      });
      report.imported += 1;
    } catch (error) {
      report.skipped += 1;
      report.errors.push({
        row: order.row,
        message: error instanceof DeskError ? error.message : "Could not import that order.",
      });
    }
  }
  report.errors.sort((a, b) => a.row - b.row);
  await recordImport("orders", userId, filename, report);
  return report;
}

export function importMessage(report: ImportReport): { ok: true; message: string } | { ok: false; error: string } {
  const problems = report.errors
    .slice(0, 6)
    .map((error) => `Row ${error.row}: ${error.message}`)
    .join(" ");
  const summary = `Saved ${report.imported}. Skipped ${report.skipped}.`;
  if (report.imported === 0 && report.errors.length > 0) {
    return { ok: false, error: `${summary} ${problems}`.trim() };
  }
  return { ok: true, message: problems ? `${summary} ${problems}` : summary };
}

export function channelFrom(value: string): Channel {
  const text = value.trim().toUpperCase();
  if (text === "TEMU" || text === "WALMART" || text === "OTHER") return text;
  throw new DeskError("Channel must be Temu, Walmart, or Other.");
}

export function percentToBps(input: string): number {
  const bps = dollarsToCents(input.trim() || "0");
  if (bps < 0 || bps > 10000) throw new DeskError("Label markup must be between 0 and 100 percent.");
  return bps;
}

export type OrderWithLines = Prisma.OrderGetPayload<{ include: { lines: { include: { product: true } }; client: true } }>;
