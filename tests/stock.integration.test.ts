import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ScopeError } from "@/lib/errors";
import { applyStockChange, withStockRetry } from "@/lib/stock-store";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("stock on postgres", () => {
  const code = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
  let userId = "";
  let clientId = "";
  let otherClientId = "";
  let productId = "";
  let locationId = "";

  afterAll(async () => {
    if (productId) {
      await db.inventoryMovement.deleteMany({ where: { productId } });
      await db.inventoryBalance.deleteMany({ where: { productId } });
      await db.product.deleteMany({ where: { id: productId } });
    }
    if (clientId || otherClientId) {
      await db.client.deleteMany({ where: { id: { in: [clientId, otherClientId].filter(Boolean) } } });
    }
    if (locationId) await db.location.deleteMany({ where: { id: locationId } });
    if (userId) {
      await db.session.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  it("receives, counts, and blocks another client's id", async () => {
    const user = await db.user.create({
      data: { email: `${code.toLowerCase()}@test.example`, name: "Test", role: "STAFF", passwordHash: "not-used" },
    });
    const client = await db.client.create({ data: { code, name: "Test client" } });
    const other = await db.client.create({ data: { code: `${code}B`.slice(0, 12), name: "Other" } });
    const location = await db.location.create({ data: { code, name: "Test bin", kind: "STORAGE" } });
    const product = await db.product.create({ data: { clientId: client.id, sku: "BOX", name: "Box" } });
    userId = user.id;
    clientId = client.id;
    otherClientId = other.id;
    locationId = location.id;
    productId = product.id;

    await withStockRetry((tx) =>
      applyStockChange(tx, {
        productId,
        locationId,
        delta: 5,
        reason: "RECEIVE",
        userId,
        expectedClientId: clientId,
      }),
    );
    const balance = await db.inventoryBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
    expect(balance?.qty).toBe(5);
    const movement = await db.inventoryMovement.findFirst({ where: { productId } });
    expect(movement?.clientId).toBe(clientId);
    expect(movement?.qtyBefore).toBe(0);
    expect(movement?.qtyAfter).toBe(5);

    await expect(
      withStockRetry((tx) =>
        applyStockChange(tx, {
          productId,
          locationId,
          delta: 1,
          reason: "RECEIVE",
          userId,
          expectedClientId: otherClientId,
        }),
      ),
    ).rejects.toBeInstanceOf(ScopeError);

    await expect(
      withStockRetry((tx) =>
        applyStockChange(tx, {
          productId,
          locationId,
          delta: -9,
          reason: "ADJUST",
          userId,
          note: "too many",
        }),
      ),
    ).rejects.toThrow(/negative/);
    const still = await db.inventoryBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
    expect(still?.qty).toBe(5);
  });
});
