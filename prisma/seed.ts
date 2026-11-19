import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { getTimeZone, isoDay } from "../src/lib/dates";
import { passwordIsAcceptable } from "../src/lib/auth-policy";
import { createInvoice, createOrder, packOrder, pickOrder, receiveStock, saveClient, shipOrder } from "../src/lib/warehouse";

const zone = getTimeZone();

async function ensureUser(email: string, name: string, role: "OWNER" | "STAFF", password: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  if (process.env.NODE_ENV === "production" && password.startsWith("cratekeep-") && process.env.SEED_ALLOW_DEMO !== "1") {
    throw new Error(`Refusing the demo password for ${email}. Set SEED_OWNER_PASSWORD or SEED_STAFF_PASSWORD.`);
  }
  const problem = passwordIsAcceptable(password, email);
  if (problem) throw new Error(problem);
  const user = await db.user.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Created ${role.toLowerCase()} ${email}`);
  console.log(`Password: ${password}`);
  return user;
}

async function main() {
  const ownerEmail = (process.env.SEED_OWNER_EMAIL || "owner@kamo.example").toLowerCase();
  const staffEmail = (process.env.SEED_STAFF_EMAIL || "staff@kamo.example").toLowerCase();
  const owner = await ensureUser(ownerEmail, "Kamo Owner", "OWNER", process.env.SEED_OWNER_PASSWORD || "cratekeep-owner");
  await ensureUser(staffEmail, "Packing Desk", "STAFF", process.env.SEED_STAFF_PASSWORD || "cratekeep-staff");

  const bins = [
    ["RECV-01", "Receiving table", "RECEIVING"],
    ["A-01", "Aisle A bin 1", "STORAGE"],
    ["A-02", "Aisle A bin 2", "STORAGE"],
    ["B-01", "Aisle B bin 1", "STORAGE"],
    ["PACK-01", "Packing table", "PACK"],
    ["SHIP-01", "Shipping table", "SHIP"],
  ] as const;
  for (const [code, name, kind] of bins) {
    await db.location.upsert({ where: { code }, update: {}, create: { code, name, kind } });
  }

  const clients = [
    { code: "NORTH", name: "Northline Home", pick: 75, pack: 150, storage: 2500, markup: 0, notes: "Mostly Temu." },
    { code: "BRIGHT", name: "BrightCart", pick: 60, pack: 200, storage: 1800, markup: 500, notes: "Walmart seller. 5% label markup." },
    { code: "HARBOR", name: "Harbor Goods", pick: 50, pack: 125, storage: 2000, markup: 0, notes: "Small mixed catalog." },
  ];
  for (const client of clients) {
    const existing = await db.client.findUnique({ where: { code: client.code } });
    if (existing) continue;
    await saveClient(owner.id, {
      name: client.name,
      code: client.code,
      contactName: "",
      email: "",
      phone: "",
      notes: client.notes,
      pickFeeCents: client.pick,
      packFeeCents: client.pack,
      storageCentsPerCuFtMonth: client.storage,
      labelMarkupBps: client.markup,
      active: true,
    });
  }

  const products = [
    ["NORTH", "MUG-12", "Stoneware mug", "840000000001", 120, 90, 100, 420, 350, 24, 48, "/samples/mug.svg"],
    ["NORTH", "TOWEL-SET", "Hand towel set", "840000000002", 280, 180, 80, 650, 800, 10, 20, "/samples/towel.svg"],
    ["NORTH", "LAMP-CLIP", "Clip lamp", "840000000003", 200, 150, 120, 540, 1200, 8, 16, "/samples/lamp.svg"],
    ["BRIGHT", "CASE-PX", "Phone case", "840000000011", 180, 90, 20, 40, 150, 30, 60, "/samples/case.svg"],
    ["BRIGHT", "CABLE-C", "USB-C cable", "840000000012", 160, 80, 20, 50, 200, 20, 40, "/samples/cable.svg"],
    ["HARBOR", "SOAP-BAR", "Cedar soap", "840000000021", 90, 60, 30, 120, 180, 12, 24, "/samples/soap.svg"],
  ] as const;
  for (const [code, sku, name, barcode, lengthMm, widthMm, heightMm, weightGrams, costCents, reorderPoint, reorderQty, photoUrl] of products) {
    const client = await db.client.findUniqueOrThrow({ where: { code } });
    const existing = await db.product.findUnique({ where: { clientId_sku: { clientId: client.id, sku } } });
    if (existing) continue;
    await db.product.create({
      data: { clientId: client.id, sku, name, barcode, lengthMm, widthMm, heightMm, weightGrams, costCents, reorderPoint, reorderQty, photoUrl },
    });
  }

  const opening = [
    ["MUG-12", "A-01", 40],
    ["TOWEL-SET", "A-02", 12],
    ["LAMP-CLIP", "A-01", 6],
    ["CASE-PX", "B-01", 80],
    ["CABLE-C", "B-01", 20],
    ["SOAP-BAR", "A-02", 3],
  ] as const;
  for (const [sku, bin, qty] of opening) {
    const product = await db.product.findFirstOrThrow({ where: { sku } });
    const moves = await db.inventoryMovement.count({ where: { productId: product.id } });
    if (moves > 0) continue;
    const location = await db.location.findUniqueOrThrow({ where: { code: bin } });
    await receiveStock(owner.id, { scan: sku, qty, locationId: location.id, clientId: product.clientId });
  }

  const today = isoDay(new Date(), zone);
  const north = await db.client.findUniqueOrThrow({ where: { code: "NORTH" } });
  const bright = await db.client.findUniqueOrThrow({ where: { code: "BRIGHT" } });
  const harbor = await db.client.findUniqueOrThrow({ where: { code: "HARBOR" } });
  const bySku = async (clientId: string, sku: string) => db.product.findFirstOrThrow({ where: { clientId, sku } });

  const open = await db.order.findUnique({ where: { clientId_externalRef: { clientId: north.id, externalRef: "TM-10021" } } });
  if (!open) {
    await createOrder({
      clientId: north.id,
      externalRef: "TM-10021",
      channel: "TEMU",
      customerName: "Temu customer",
      shipLine1: "10 Packing Lane",
      shipCity: "Newark",
      shipRegion: "NJ",
      shipPostal: "07102",
      shipCountry: "US",
      shipBy: new Date(),
      lines: [
        { productId: (await bySku(north.id, "MUG-12")).id, qty: 2 },
        { productId: (await bySku(north.id, "TOWEL-SET")).id, qty: 1 },
      ],
    });
  }

  const harborOrder = await db.order.findUnique({ where: { clientId_externalRef: { clientId: harbor.id, externalRef: "HG-19" } } });
  if (!harborOrder) {
    await createOrder({
      clientId: harbor.id,
      externalRef: "HG-19",
      channel: "OTHER",
      customerName: "Shop customer",
      shipLine1: "4 Dock Street",
      shipCity: "Elizabeth",
      shipRegion: "NJ",
      shipPostal: "07201",
      shipCountry: "US",
      shipBy: new Date(),
      lines: [{ productId: (await bySku(harbor.id, "SOAP-BAR")).id, qty: 2 }],
    });
  }

  let packed = await db.order.findUnique({ where: { clientId_externalRef: { clientId: bright.id, externalRef: "WM-4401" } } });
  if (!packed) {
    packed = await createOrder({
      clientId: bright.id,
      externalRef: "WM-4401",
      channel: "WALMART",
      customerName: "Walmart customer",
      shipLine1: "88 Market Road",
      shipCity: "Edison",
      shipRegion: "NJ",
      shipPostal: "08817",
      shipCountry: "US",
      shipBy: new Date(),
      lines: [{ productId: (await bySku(bright.id, "CASE-PX")).id, qty: 1 }],
    });
  }
  if (packed.status === "IMPORTED" || packed.status === "PICKING") {
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: packed.id }, include: { product: true } });
    if (line.pickedQty < line.qty) {
      await pickOrder(owner.id, { orderId: packed.id, scan: line.product.sku, qty: line.qty - line.pickedQty });
    }
    const fresh = await db.order.findUniqueOrThrow({ where: { id: packed.id }, include: { lines: true } });
    if (fresh.status === "PICKING" && fresh.lines.every((item) => item.pickedQty === item.qty)) {
      await packOrder(packed.id);
    }
  }

  let shipped = await db.order.findUnique({ where: { clientId_externalRef: { clientId: bright.id, externalRef: "WM-4390" } } });
  if (!shipped) {
    shipped = await createOrder({
      clientId: bright.id,
      externalRef: "WM-4390",
      channel: "WALMART",
      customerName: "Walmart customer",
      shipLine1: "2 River Ave",
      shipCity: "Jersey City",
      shipRegion: "NJ",
      shipPostal: "07302",
      shipCountry: "US",
      shipBy: new Date(),
      lines: [{ productId: (await bySku(bright.id, "CABLE-C")).id, qty: 2 }],
    });
  }
  if (shipped.status === "IMPORTED" || shipped.status === "PICKING") {
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: shipped.id }, include: { product: true } });
    if (line.pickedQty < line.qty) await pickOrder(owner.id, { orderId: shipped.id, scan: line.product.sku, qty: line.qty - line.pickedQty });
    const fresh = await db.order.findUniqueOrThrow({ where: { id: shipped.id }, include: { lines: true } });
    if (fresh.status === "PICKING") await packOrder(shipped.id);
  }
  const afterPack = await db.order.findUniqueOrThrow({ where: { id: shipped.id } });
  if (afterPack.status === "PACKED") {
    await shipOrder(shipped.id, {
      trackingNumber: "1Z999DEMO",
      carrier: "UPS",
      labelVendor: "Pirate Ship",
      labelCostCents: 612,
    });
  }

  const inbound = await db.inboundShipment.findUnique({ where: { clientId_reference: { clientId: north.id, reference: "PO-778" } } });
  if (!inbound) {
    const shipment = await db.inboundShipment.create({
      data: { clientId: north.id, reference: "PO-778", notes: "Mugs on the way.", status: "EXPECTED" },
    });
    const mug = await bySku(north.id, "MUG-12");
    await db.inboundLine.create({ data: { shipmentId: shipment.id, productId: mug.id, expectedQty: 24 } });
  }

  const [year, month] = today.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const start = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const end = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const already = await db.invoice.findFirst({ where: { clientId: north.id, number: { startsWith: "KAMO-" } } });
  if (!already) {
    await createInvoice(north.id, start, end, zone);
  }

  console.log("Seed finished. Passwords that already existed were left alone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
