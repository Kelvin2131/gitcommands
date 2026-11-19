import type { MovementReason } from "@prisma/client";
import { db, isUniqueConflict, type Tx } from "@/lib/db";
import { ScopeError, StockError } from "@/lib/errors";
import { nextQuantity } from "@/lib/inventory";

export async function applyStockChange(
  tx: Tx,
  input: {
    productId: string;
    locationId: string;
    delta: number;
    reason: MovementReason;
    userId: string;
    note?: string;
    referenceType?: string;
    referenceId?: string;
    expectedClientId?: string;
  },
): Promise<{ before: number; after: number; clientId: string }> {
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.active) throw new StockError("That product is not active.");
  if (input.expectedClientId && product.clientId !== input.expectedClientId) {
    throw new ScopeError("That product belongs to a different client.");
  }
  const location = await tx.location.findUnique({ where: { id: input.locationId } });
  if (!location || !location.active) throw new StockError("That bin is not on the floor.");

  const existing = await tx.inventoryBalance.findUnique({
    where: { productId_locationId: { productId: product.id, locationId: location.id } },
  });
  const before = existing?.qty ?? 0;
  const after = nextQuantity(before, input.delta);

  if (!existing) {
    try {
      await tx.inventoryBalance.create({
        data: { productId: product.id, locationId: location.id, qty: after },
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw new StockError("Someone else changed this bin. Try again.");
      throw error;
    }
  } else {
    const updated = await tx.inventoryBalance.updateMany({
      where: { id: existing.id, qty: before },
      data: { qty: after },
    });
    if (updated.count !== 1) throw new StockError("Someone else changed this bin. Try again.");
  }

  await tx.inventoryMovement.create({
    data: {
      productId: product.id,
      clientId: product.clientId,
      locationId: location.id,
      qtyDelta: input.delta,
      qtyBefore: before,
      qtyAfter: after,
      reason: input.reason,
      note: (input.note ?? "").slice(0, 300),
      userId: input.userId,
      referenceType: input.referenceType ?? "",
      referenceId: input.referenceId ?? "",
    },
  });

  return { before, after, clientId: product.clientId };
}

export async function withStockRetry<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(fn);
    } catch (error) {
      const retry =
        (error instanceof StockError && error.message.includes("Someone else")) || isUniqueConflict(error);
      if (!retry) throw error;
      last = error;
    }
  }
  throw last instanceof Error ? last : new StockError("Someone else changed this bin. Try again.");
}
