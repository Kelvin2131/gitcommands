import { NextResponse } from "next/server";
import { ORDER_HEADERS, PRODUCT_HEADERS, STOCK_HEADERS, toCsv } from "@/lib/csv";
import { isoDay, getTimeZone } from "@/lib/dates";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { kind } = await context.params;
  const owner = user.role === "OWNER";
  let csv = "";
  if (kind === "products") {
    const products = await db.product.findMany({ include: { client: true }, orderBy: [{ client: { code: "asc" } }, { sku: "asc" }] });
    csv = toCsv(PRODUCT_HEADERS, products.map((product) => [
      product.client.code,
      product.sku,
      product.name,
      product.barcode,
      product.description,
      product.photoUrl,
      product.lengthMm,
      product.widthMm,
      product.heightMm,
      product.weightGrams,
      owner ? product.costCents : "",
      product.reorderPoint,
      product.reorderQty,
    ]));
  } else if (kind === "stock") {
    const balances = await db.inventoryBalance.findMany({
      where: { qty: { gt: 0 } },
      include: { product: { include: { client: true } }, location: true },
      orderBy: [{ location: { code: "asc" } }],
    });
    csv = toCsv(STOCK_HEADERS, balances.map((balance) => [
      balance.product.client.code,
      balance.product.sku,
      balance.location.code,
      balance.qty,
      "set",
    ]));
  } else if (kind === "orders") {
    const orders = await db.order.findMany({
      include: { client: true, lines: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const zone = getTimeZone();
    const rows = orders.flatMap((order) =>
      order.lines.map((line) => [
        order.client.code,
        order.externalRef,
        order.channel,
        order.customerName,
        order.shipLine1,
        order.shipCity,
        order.shipRegion,
        order.shipPostal,
        order.shipCountry,
        order.shipBy ? isoDay(order.shipBy, zone) : "",
        line.product.sku,
        line.qty,
      ]),
    );
    csv = toCsv(ORDER_HEADERS, rows);
  } else {
    return NextResponse.json({ error: "That export does not exist." }, { status: 404 });
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
    },
  });
}
