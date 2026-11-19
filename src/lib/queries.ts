import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getTimeZone, startOfZonedDay, zonedMonthRange, zonedParts, addCalendarDays, parseZonedDate } from "@/lib/dates";
import { openOrderStatuses } from "@/lib/order-status";
import { restockSuggestion } from "@/lib/inventory";

function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

export function todayBounds(now = new Date(), timeZone = getTimeZone()) {
  const start = startOfZonedDay(now, timeZone);
  const parts = zonedParts(now, timeZone);
  const iso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const end = parseZonedDate(addCalendarDays(iso, 1), timeZone);
  return { start, end, timeZone };
}

export async function dashboardData(now = new Date()) {
  const zone = getTimeZone();
  const today = todayBounds(now, zone);
  const month = zonedMonthRange(now, zone);
  const open = openOrderStatuses();
  const [dueOrders, dueCount, stockRows, profitRows, labelRows, lowRows] = await Promise.all([
    db.order.findMany({
      where: {
        status: { in: open },
        OR: [{ shipBy: null }, { shipBy: { lt: today.end } }],
      },
      include: { client: { select: { code: true, name: true } }, lines: { select: { qty: true, pickedQty: true } } },
      orderBy: [{ shipBy: "asc" }, { createdAt: "asc" }],
      take: 25,
    }),
    db.order.count({
      where: {
        status: { in: open },
        OR: [{ shipBy: null }, { shipBy: { lt: today.end } }],
      },
    }),
    db.$queryRaw<{ id: string; value: bigint }[]>(Prisma.sql`
      SELECT c.id,
        COALESCE(SUM(b.qty * p."costCents"), 0)::bigint AS value
      FROM "Client" c
      LEFT JOIN "Product" p ON p."clientId" = c.id AND p.active = true
      LEFT JOIN "InventoryBalance" b ON b."productId" = p.id
      GROUP BY c.id
    `),
    db.$queryRaw<{ id: string; name: string; profit: bigint }[]>(Prisma.sql`
      SELECT c.id, c.name,
        COALESCE(SUM(o."pickFeeCents" + o."packFeeCents" + (o."labelBilledCents" - o."labelCostCents")), 0)::bigint AS profit
      FROM "Client" c
      LEFT JOIN "Order" o ON o."clientId" = c.id
        AND o."shippedAt" >= ${month.start}
        AND o."shippedAt" < ${month.end}
        AND o.status IN ('SHIPPED', 'RETURNED')
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `),
    db.$queryRaw<{ vendor: string; spend: bigint }[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(o."labelVendor", ''), 'Unknown') AS vendor,
        COALESCE(SUM(o."labelCostCents"), 0)::bigint AS spend
      FROM "Order" o
      WHERE o."shippedAt" >= ${month.start}
        AND o."shippedAt" < ${month.end}
        AND o.status IN ('SHIPPED', 'RETURNED')
      GROUP BY 1
      ORDER BY spend DESC
    `),
    db.$queryRaw<
      {
        id: string;
        sku: string;
        name: string;
        client_code: string;
        reorderPoint: number;
        reorderQty: number;
        on_hand: number;
        bins: string;
      }[]
    >(Prisma.sql`
      SELECT p.id, p.sku, p.name, c.code AS client_code,
        p."reorderPoint", p."reorderQty",
        COALESCE(SUM(b.qty), 0)::int AS on_hand,
        COALESCE(string_agg(l.code || ':' || b.qty::text, ', ' ORDER BY l.code), '') AS bins
      FROM "Product" p
      JOIN "Client" c ON c.id = p."clientId"
      LEFT JOIN "InventoryBalance" b ON b."productId" = p.id AND b.qty <> 0
      LEFT JOIN "Location" l ON l.id = b."locationId"
      WHERE p.active = true AND p."reorderPoint" > 0
      GROUP BY p.id, c.code
      HAVING COALESCE(SUM(b.qty), 0) <= p."reorderPoint"
      ORDER BY COALESCE(SUM(b.qty), 0) ASC, p.sku ASC
      LIMIT 40
    `),
  ]);

  const stockByClient = new Map(stockRows.map((row) => [row.id, asNumber(row.value)]));
  const stockValueCents = [...stockByClient.values()].reduce((sum, value) => sum + value, 0);
  const low = lowRows.map((row) => {
    const onHand = asNumber(row.on_hand);
    const suggestion = restockSuggestion(onHand, asNumber(row.reorderPoint), asNumber(row.reorderQty));
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      clientCode: row.client_code,
      onHand,
      bins: row.bins,
      suggest: suggestion?.suggest ?? 0,
    };
  });

  return {
    dueOrders,
    dueCount,
    stockValueCents,
    stockByClient,
    profit: profitRows.map((row) => ({ id: row.id, name: row.name, cents: asNumber(row.profit) })),
    labels: labelRows.map((row) => ({ vendor: row.vendor, cents: asNumber(row.spend) })),
    labelSpendCents: labelRows.reduce((sum, row) => sum + asNumber(row.spend), 0),
    low,
  };
}

export async function listLocations() {
  return db.location.findMany({ where: { active: true }, orderBy: { code: "asc" } });
}

export async function listClients() {
  return db.client.findMany({ orderBy: { code: "asc" } });
}
