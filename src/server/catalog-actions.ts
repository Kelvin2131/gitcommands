"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { field, intField, moneyField, requireField } from "@/lib/form";
import { percentToBps, saveClient, saveLocation, saveProduct } from "@/lib/warehouse";
import { deskWork, ownerWork } from "@/server/action";

export async function saveClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async (user) => {
    const id = field(form, "id");
    await saveClient(user.id, {
      id: id || undefined,
      name: requireField(form, "name", "Name"),
      code: requireField(form, "code", "Code"),
      contactName: field(form, "contactName"),
      email: field(form, "email"),
      phone: field(form, "phone"),
      notes: field(form, "notes"),
      pickFeeCents: moneyField(form, "pickFee", "Pick fee"),
      packFeeCents: moneyField(form, "packFee", "Fee per box"),
      storageCentsPerCuFtMonth: moneyField(form, "storageFee", "Storage fee"),
      labelMarkupBps: percentToBps(field(form, "markup") || "0"),
      active: field(form, "active") !== "0",
    });
    redirect("/clients?notice=" + encodeURIComponent("Client saved."));
  });
}

export async function saveLocationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async () => {
    await saveLocation({
      code: requireField(form, "code", "Bin code"),
      name: requireField(form, "name", "Bin name"),
      kind: field(form, "kind") || "STORAGE",
    });
    redirect("/inventory?notice=" + encodeURIComponent("Bin added."));
  });
}

export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const id = await saveProduct(
      {
        id: field(form, "id") || undefined,
        clientId: requireField(form, "clientId", "Client"),
        sku: requireField(form, "sku", "SKU"),
        name: requireField(form, "name", "Name"),
        barcode: field(form, "barcode"),
        description: field(form, "description"),
        photoUrl: field(form, "photoUrl"),
        lengthMm: intField(form, "lengthMm", "Length", 0),
        widthMm: intField(form, "widthMm", "Width", 0),
        heightMm: intField(form, "heightMm", "Height", 0),
        weightGrams: intField(form, "weightGrams", "Weight", 0),
        costCents: user.role === "OWNER" ? moneyField(form, "cost", "Cost") : 0,
        reorderPoint: intField(form, "reorderPoint", "Reorder point", 0),
        reorderQty: intField(form, "reorderQty", "Reorder quantity", 0),
        active: field(form, "active") !== "0",
      },
      user.role === "OWNER",
    );
    redirect(`/products/${id}?notice=` + encodeURIComponent("Product saved."));
  });
}
