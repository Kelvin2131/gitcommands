"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { getTimeZone, parseZonedDate } from "@/lib/dates";
import { field, intField, moneyField, requireField } from "@/lib/form";
import { cancelOrder, channelFrom, createOrder, packOrder, pickOrder, shipOrder, unpackOrder } from "@/lib/warehouse";
import { deskWork } from "@/server/action";

export async function createOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const sku = requireField(form, "productId", "Product");
    const shipBy = field(form, "shipBy");
    const order = await createOrder({
      clientId: requireField(form, "clientId", "Client"),
      externalRef: requireField(form, "externalRef", "Order number"),
      channel: channelFrom(field(form, "channel") || "OTHER"),
      customerName: field(form, "customerName"),
      shipLine1: field(form, "shipLine1"),
      shipCity: field(form, "shipCity"),
      shipRegion: field(form, "shipRegion"),
      shipPostal: field(form, "shipPostal"),
      shipCountry: field(form, "shipCountry") || "US",
      shipBy: shipBy ? parseZonedDate(shipBy, getTimeZone()) : null,
      lines: [{ productId: sku, qty: intField(form, "qty", "Quantity", 1) }],
    });
    redirect(`/orders/${order.id}?notice=` + encodeURIComponent("Order added. Scan to pick."));
  });
}

export async function pickAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const orderId = requireField(form, "orderId", "Order");
    await pickOrder(user.id, {
      orderId,
      scan: requireField(form, "scan", "Barcode"),
      qty: intField(form, "qty", "Quantity", 1),
      locationId: field(form, "locationId") || undefined,
    });
    redirect(`/orders/${orderId}?notice=` + encodeURIComponent("Picked."));
  });
}

export async function packAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const orderId = requireField(form, "orderId", "Order");
    await packOrder(orderId);
    redirect(`/orders/${orderId}?notice=` + encodeURIComponent("Packed. Add the label next."));
  });
}

export async function unpackAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const orderId = requireField(form, "orderId", "Order");
    await unpackOrder(orderId);
    redirect(`/orders/${orderId}?notice=` + encodeURIComponent("Back to picking."));
  });
}

export async function shipAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const orderId = requireField(form, "orderId", "Order");
    await shipOrder(orderId, {
      trackingNumber: requireField(form, "trackingNumber", "Tracking number"),
      carrier: requireField(form, "carrier", "Carrier"),
      labelVendor: requireField(form, "labelVendor", "Label vendor"),
      labelCostCents: moneyField(form, "labelCost", "Label cost"),
    });
    redirect(`/orders/${orderId}?notice=` + encodeURIComponent("Shipped."));
  });
}

export async function cancelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const orderId = requireField(form, "orderId", "Order");
    await cancelOrder(user.id, orderId, field(form, "locationId"));
    redirect(`/orders/${orderId}?notice=` + encodeURIComponent("Order cancelled."));
  });
}
