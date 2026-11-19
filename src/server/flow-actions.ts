"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { getTimeZone } from "@/lib/dates";
import { field, intField, requireField } from "@/lib/form";
import {
  addInboundExpectation,
  closeInbound,
  closeReturn,
  createInbound,
  createInvoice,
  deleteDraftInvoice,
  openReturn,
  restockReturn,
  setInvoiceStatus,
} from "@/lib/warehouse";
import { deskWork, ownerWork } from "@/server/action";

export async function createInboundAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const shipment = await createInbound({
      clientId: requireField(form, "clientId", "Client"),
      reference: requireField(form, "reference", "Reference"),
      notes: field(form, "notes"),
    });
    redirect(`/receive/${shipment.id}?notice=` + encodeURIComponent("Shipment opened."));
  });
}

export async function expectLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const shipmentId = requireField(form, "shipmentId", "Shipment");
    await addInboundExpectation({
      shipmentId,
      sku: requireField(form, "sku", "SKU"),
      qty: intField(form, "qty", "Expected"),
    });
    redirect(`/receive/${shipmentId}?notice=` + encodeURIComponent("Expected line saved."));
  });
}

export async function closeInboundAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const shipmentId = requireField(form, "shipmentId", "Shipment");
    await closeInbound(shipmentId);
    redirect(`/receive/${shipmentId}?notice=` + encodeURIComponent("Shipment closed."));
  });
}

export async function openReturnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const created = await openReturn({
      orderId: requireField(form, "orderId", "Order"),
      reason: field(form, "reason"),
    });
    redirect(`/returns/${created.id}?notice=` + encodeURIComponent("Return opened."));
  });
}

export async function restockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async (user) => {
    const returnId = requireField(form, "returnId", "Return");
    await restockReturn(user.id, {
      returnId,
      lineId: requireField(form, "lineId", "Line"),
      locationId: requireField(form, "locationId", "Bin"),
      qty: intField(form, "qty", "Quantity", 1),
    });
    redirect(`/returns/${returnId}?notice=` + encodeURIComponent("Put back on the shelf."));
  });
}

export async function closeReturnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deskWork(async () => {
    const returnId = requireField(form, "returnId", "Return");
    const mode = field(form, "mode") === "restocked" ? "restocked" : "discarded";
    await closeReturn(returnId, mode);
    redirect(`/returns/${returnId}?notice=` + encodeURIComponent("Return closed."));
  });
}

export async function createInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async () => {
    const invoice = await createInvoice(
      requireField(form, "clientId", "Client"),
      requireField(form, "start", "Start date"),
      requireField(form, "end", "End date"),
      getTimeZone(),
    );
    redirect(`/billing/${invoice.id}?notice=` + encodeURIComponent("Draft invoice ready. Check it before you send it."));
  });
}

export async function invoiceStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async () => {
    const invoiceId = requireField(form, "invoiceId", "Invoice");
    const status = field(form, "status");
    if (status !== "ISSUED" && status !== "PAID" && status !== "VOID") {
      return { ok: false, error: "That invoice step is not valid." };
    }
    await setInvoiceStatus(invoiceId, status);
    redirect(`/billing/${invoiceId}?notice=` + encodeURIComponent("Invoice updated."));
  });
}

export async function deleteInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async () => {
    await deleteDraftInvoice(requireField(form, "invoiceId", "Invoice"));
    redirect("/billing?notice=" + encodeURIComponent("Draft deleted."));
  });
}
