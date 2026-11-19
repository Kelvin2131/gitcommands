import { ScopeError, StockError } from "@/lib/errors";
import { lineAmountCents, sumCents } from "@/lib/money";

const MAX_BIN_QTY = 1_000_000;
const MAX_MOVE = 100_000;

export function nextQuantity(current: number, delta: number): number {
  if (!Number.isInteger(current) || current < 0) {
    throw new StockError("The bin quantity is not valid.");
  }
  if (!Number.isInteger(delta) || Math.abs(delta) > MAX_MOVE) {
    throw new StockError("That quantity is too large. Enter 100,000 or fewer.");
  }
  const next = current + delta;
  if (next < 0) throw new StockError("That would make the bin negative. Count the shelf, then try a smaller number.");
  if (next > MAX_BIN_QTY) throw new StockError("A bin cannot hold more than 1,000,000 units.");
  return next;
}

export function deltaForCycleCount(onHand: number, counted: number): number {
  if (!Number.isInteger(counted) || counted < 0) {
    throw new StockError("A count must be zero or more.");
  }
  if (!Number.isInteger(onHand) || onHand < 0) {
    throw new StockError("The bin quantity is not valid.");
  }
  return counted - onHand;
}

export function planTransfer(qty: number): { out: number; inn: number } {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new StockError("Move at least 1 unit.");
  }
  return { out: -qty, inn: qty };
}

export function restockSuggestion(
  onHand: number,
  reorderPoint: number,
  reorderQty: number,
): { shortfall: number; suggest: number } | null {
  if (!Number.isInteger(onHand) || !Number.isInteger(reorderPoint) || !Number.isInteger(reorderQty)) {
    throw new StockError("Restock numbers must be whole units.");
  }
  if (reorderPoint <= 0 || onHand > reorderPoint) return null;
  const shortfall = reorderPoint - onHand;
  const suggest = reorderQty > 0 ? Math.max(reorderQty, shortfall) : shortfall;
  return { shortfall, suggest };
}

export function stockValueCents(lines: { qty: number; costCents: number }[]): number {
  return sumCents(lines.map((line) => lineAmountCents(line.qty, line.costCents)));
}

export function planPick(input: {
  onHand: number;
  ordered: number;
  alreadyPicked: number;
  qty: number;
}): { pickQty: number; linePicked: number; done: boolean } {
  const { ordered, alreadyPicked, qty } = input;
  if (!Number.isInteger(ordered) || ordered <= 0) throw new StockError("The order line is not valid.");
  if (!Number.isInteger(alreadyPicked) || alreadyPicked < 0 || alreadyPicked > ordered) {
    throw new StockError("The picked quantity is not valid.");
  }
  if (!Number.isInteger(qty) || qty <= 0) throw new StockError("Pick at least 1.");
  const remaining = ordered - alreadyPicked;
  if (qty > remaining) {
    throw new StockError(`This order only needs ${remaining} more.`);
  }
  nextQuantity(input.onHand, -qty);
  const linePicked = alreadyPicked + qty;
  return { pickQty: qty, linePicked, done: linePicked === ordered };
}

export function assertProductsBelongToClient(clientId: string, products: { clientId: string; sku?: string }[]): void {
  if (!clientId) throw new ScopeError("Choose a client first.");
  for (const product of products) {
    if (product.clientId !== clientId) {
      throw new ScopeError(
        product.sku
          ? `${product.sku} belongs to a different client.`
          : "That product belongs to a different client.",
      );
    }
  }
}

export function assertSameBin(fromId: string, toId: string): void {
  if (!fromId || !toId) throw new StockError("Choose both bins.");
  if (fromId === toId) throw new StockError("Pick a different bin to move into.");
}
