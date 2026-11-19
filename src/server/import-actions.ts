"use server";

import type { ActionState } from "@/lib/action-state";
import { getTimeZone } from "@/lib/dates";
import { csvTextFromForm, field } from "@/lib/form";
import { importMessage, importOrders, importProducts, importStock } from "@/lib/warehouse";
import { deskWork } from "@/server/action";

export async function importProductsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const text = await csvTextFromForm(form);
    const report = await importProducts(user.id, text, field(form, "filename") || "paste.csv", user.role === "OWNER");
    return importMessage(report);
  });
}

export async function importStockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const text = await csvTextFromForm(form);
    const report = await importStock(user.id, text, field(form, "filename") || "paste.csv");
    return importMessage(report);
  });
}

export async function importOrdersAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const text = await csvTextFromForm(form);
    const report = await importOrders(user.id, text, field(form, "filename") || "paste.csv", getTimeZone());
    return importMessage(report);
  });
}
