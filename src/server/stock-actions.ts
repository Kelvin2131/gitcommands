"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { field, intField, requireField, safePath, withNotice } from "@/lib/form";
import { adjustStock, countByScan, cycleCount, receiveStock, transferStock } from "@/lib/warehouse";
import { deskWork } from "@/server/action";

export async function receiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const product = await receiveStock(user.id, {
      scan: requireField(form, "scan", "Barcode"),
      qty: intField(form, "qty", "Quantity", 1),
      locationId: requireField(form, "locationId", "Bin"),
      clientId: field(form, "clientId") || undefined,
      shipmentId: field(form, "shipmentId") || undefined,
    });
    const back = safePath(field(form, "back"), "/scan?mode=receive");
    redirect(withNotice(back, `Received ${product.sku}.`));
  });
}

export async function countScanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const product = await countByScan(user.id, {
      scan: requireField(form, "scan", "Barcode"),
      locationId: requireField(form, "locationId", "Bin"),
      counted: intField(form, "counted", "Count"),
      clientId: field(form, "clientId") || undefined,
    });
    redirect(withNotice("/scan?mode=count", `Counted ${product.sku}.`));
  });
}

export async function countAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    await cycleCount(user.id, {
      productId: requireField(form, "productId", "Product"),
      locationId: requireField(form, "locationId", "Bin"),
      counted: intField(form, "counted", "Count"),
    });
    redirect(withNotice(safePath(field(form, "back"), "/inventory"), "Count saved."));
  });
}

export async function adjustAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    await adjustStock(user.id, {
      productId: requireField(form, "productId", "Product"),
      locationId: requireField(form, "locationId", "Bin"),
      delta: intField(form, "delta", "Change"),
      note: requireField(form, "note", "Reason"),
    });
    redirect(withNotice(safePath(field(form, "back"), "/inventory"), "Adjustment saved."));
  });
}

export async function transferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    await transferStock(user.id, {
      productId: requireField(form, "productId", "Product"),
      fromId: requireField(form, "fromId", "From bin"),
      toId: requireField(form, "toId", "To bin"),
      qty: intField(form, "qty", "Quantity"),
    });
    redirect(`/products/${field(form, "productId")}?notice=` + encodeURIComponent("Moved."));
  });
}
