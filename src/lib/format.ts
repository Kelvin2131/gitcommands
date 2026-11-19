import { formatCents } from "@/lib/money";

export function money(cents: number): string {
  return formatCents(cents);
}

export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function units(qty: number): string {
  return `${qty.toLocaleString("en-US")} ${qty === 1 ? "unit" : "units"}`;
}

export function channelLabel(channel: string): string {
  if (channel === "TEMU") return "Temu";
  if (channel === "WALMART") return "Walmart";
  return "Other";
}

export function reasonLabel(reason: string): string {
  switch (reason) {
    case "RECEIVE":
      return "Received";
    case "ADJUST":
      return "Adjustment";
    case "CYCLE_COUNT":
      return "Cycle count";
    case "PICK":
      return "Picked";
    case "RETURN":
      return "Returned";
    case "TRANSFER":
      return "Moved";
    default:
      return reason;
  }
}
