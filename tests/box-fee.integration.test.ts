import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/dates";
import { applyStockChange, withStockRetry } from "@/lib/stock-store";
import {
  cancelOrder,
  createInvoice,
  createOrder,
  deleteDraftInvoice,
  packOrder,
  pickOrder,
  shipOrder,
  unpackOrder,
  updateBoxCount,
} from "@/lib/warehouse";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("box fees on postgres", () => {
  const code = `B${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`.toUpperCase().slice(0, 12);
  const zone = "America/New_York";
  let userId = "";
  let clientId = "";
  let productId = "";
  let locationId = "";
  const orderIds: string[] = [];
  let invoiceId = "";

  afterAll(async () => {
    if (invoiceId) await db.invoice.deleteMany({ where: { id: invoiceId } });
    if (orderIds.length > 0) await db.order.deleteMany({ where: { id: { in: orderIds } } });
    if (productId) {
      await db.inventoryMovement.deleteMany({ where: { productId } });
      await db.inventoryBalance.deleteMany({ where: { productId } });
      await db.product.deleteMany({ where: { id: productId } });
    }
    if (clientId) await db.client.deleteMany({ where: { id: clientId } });
    if (locationId) await db.location.deleteMany({ where: { id: locationId } });
    if (userId) {
      await db.session.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  it("bills boxes at the captured rate, then clears pick, box, and label fees on unpack and cancel", async () => {
    const user = await db.user.create({
      data: { email: `${code.toLowerCase()}@test.example`, name: "Box tester", role: "STAFF", passwordHash: "not-used" },
    });
    const client = await db.client.create({
      data: { code, name: "Box client", pickFeeCents: 75, packFeeCents: 200 },
    });
    const location = await db.location.create({ data: { code, name: "Box bin", kind: "STORAGE" } });
    const product = await db.product.create({ data: { clientId: client.id, sku: "BOX", name: "Box" } });
    userId = user.id;
    clientId = client.id;
    locationId = location.id;
    productId = product.id;

    await withStockRetry((tx) =>
      applyStockChange(tx, {
        productId,
        locationId,
        delta: 10,
        reason: "RECEIVE",
        userId,
        expectedClientId: clientId,
      }),
    );

    const shipped = await createOrder({
      clientId,
      externalRef: "BOX-2",
      channel: "OTHER",
      customerName: "Two boxes",
      shipLine1: "1 Dock",
      shipCity: "Newark",
      shipRegion: "NJ",
      shipPostal: "07102",
      shipCountry: "US",
      shipBy: null,
      lines: [{ productId, qty: 2 }],
    });
    orderIds.push(shipped.id);
    await pickOrder(userId, { orderId: shipped.id, scan: "BOX", qty: 2, locationId });
    await packOrder(shipped.id, 2);
    let fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(fresh.boxCount).toBe(2);
    expect(fresh.packFeeCents).toBe(400);
    expect(fresh.pickFeeCents).toBe(150);

    await db.client.update({ where: { id: clientId }, data: { packFeeCents: 300 } });
    await updateBoxCount(shipped.id, 3);
    fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(fresh.boxCount).toBe(3);
    expect(fresh.packFeeCents).toBe(600);

    await unpackOrder(shipped.id);
    fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(fresh.status).toBe("PICKING");
    expect(fresh.boxCount).toBe(1);
    expect(fresh.pickFeeCents).toBe(0);
    expect(fresh.packFeeCents).toBe(0);
    expect(fresh.labelBilledCents).toBe(0);
    expect(fresh.labelCostCents).toBe(0);

    await packOrder(shipped.id, 2);
    await shipOrder(shipped.id, {
      trackingNumbers: ["1ZBOX111", "1ZBOX222"],
      carrier: "UPS",
      labelVendor: "Pirate Ship",
      labelCostCents: 800,
    });
    fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(fresh.status).toBe("SHIPPED");
    expect(fresh.boxCount).toBe(2);
    expect(fresh.packFeeCents).toBe(600);
    expect(fresh.trackingNumber).toBe("1ZBOX111");
    expect(fresh.trackingNumbers).toBe("1ZBOX111\n1ZBOX222");
    expect(fresh.labelBilledCents).toBe(800);

    const day = isoDay(fresh.shippedAt ?? new Date(), zone);
    const invoice = await createInvoice(clientId, day, day, zone);
    invoiceId = invoice.id;
    expect(invoice.pickPackCents).toBe(150 + 600);
    const packLine = await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id, kind: "PACK" } });
    expect(packLine.qty).toBe(2);
    expect(packLine.unitCents).toBe(300);
    expect(packLine.amountCents).toBe(600);
    await expect(updateBoxCount(shipped.id, 4)).rejects.toThrow(/invoice/);

    await deleteDraftInvoice(invoice.id);
    invoiceId = "";
    await updateBoxCount(shipped.id, 1);
    fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(fresh.boxCount).toBe(1);
    expect(fresh.packFeeCents).toBe(300);
    expect(fresh.trackingNumber).toBe("1ZBOX111");
    expect(fresh.trackingNumbers).toBe("1ZBOX111");

    const cancelled = await createOrder({
      clientId,
      externalRef: "BOX-X",
      channel: "OTHER",
      customerName: "Cancel me",
      shipLine1: "2 Dock",
      shipCity: "Newark",
      shipRegion: "NJ",
      shipPostal: "07102",
      shipCountry: "US",
      shipBy: null,
      lines: [{ productId, qty: 1 }],
    });
    orderIds.push(cancelled.id);
    await pickOrder(userId, { orderId: cancelled.id, scan: "BOX", qty: 1, locationId });
    await packOrder(cancelled.id, 2);
    await db.order.update({
      where: { id: cancelled.id },
      data: { labelCostCents: 500, labelBilledCents: 525 },
    });
    await cancelOrder(userId, cancelled.id, locationId);
    fresh = await db.order.findUniqueOrThrow({ where: { id: cancelled.id } });
    expect(fresh.status).toBe("CANCELLED");
    expect(fresh.boxCount).toBe(1);
    expect(fresh.pickFeeCents).toBe(0);
    expect(fresh.packFeeCents).toBe(0);
    expect(fresh.labelCostCents).toBe(0);
    expect(fresh.labelBilledCents).toBe(0);

    const clientAfter = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(clientAfter.packFeeCents).toBe(300);
  });
});
