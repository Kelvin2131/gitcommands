import { DeskError } from "@/lib/errors";

export const ORDER_STATUSES = ["IMPORTED", "PICKING", "PACKED", "SHIPPED", "CANCELLED", "RETURNED"] as const;
export type OrderStatusName = (typeof ORDER_STATUSES)[number];

const NEXT: Record<OrderStatusName, OrderStatusName[]> = {
  IMPORTED: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "PICKING", "CANCELLED"],
  SHIPPED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export function assertTransition(from: OrderStatusName, to: OrderStatusName): void {
  if (!NEXT[from].includes(to)) {
    throw new DeskError(`An order cannot go from ${labelStatus(from)} to ${labelStatus(to)}.`);
  }
}

export function labelStatus(status: string): string {
  switch (status) {
    case "IMPORTED":
      return "Ready to pick";
    case "PICKING":
      return "Picking";
    case "PACKED":
      return "Packed";
    case "SHIPPED":
      return "Shipped";
    case "CANCELLED":
      return "Cancelled";
    case "RETURNED":
      return "Returned";
    case "EXPECTED":
      return "Expected";
    case "RECEIVING":
      return "Receiving";
    case "CLOSED":
      return "Closed";
    case "OPEN":
      return "Open";
    case "RESTOCKED":
      return "Restocked";
    case "DISCARDED":
      return "Not restocked";
    case "DRAFT":
      return "Draft";
    case "ISSUED":
      return "Issued";
    case "PAID":
      return "Paid";
    case "VOID":
      return "Void";
    default:
      return status;
  }
}

export function openOrderStatuses(): OrderStatusName[] {
  return ["IMPORTED", "PICKING", "PACKED"];
}
