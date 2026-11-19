import { DeskError } from "@/lib/errors";

const CU_FT_DENOMINATOR = 28316846592n;
const DAYS_IN_RATE = 30n;

export function assertCents(value: number, label = "Amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new DeskError(`${label} must be a whole number of cents.`);
  }
}

export function assertNonNegativeCents(value: number, label = "Amount"): void {
  assertCents(value, label);
  if (value < 0) throw new DeskError(`${label} cannot be negative.`);
}

/** Half-up division for integer money. Ties round away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new DeskError("Cannot divide money by zero.");
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const quotient = n / denominator;
  const remainder = n % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function sumCents(values: number[]): number {
  let total = 0n;
  for (const value of values) {
    assertCents(value);
    total += BigInt(value);
  }
  const asNumber = Number(total);
  if (!Number.isSafeInteger(asNumber)) throw new DeskError("That total is too large.");
  return asNumber;
}

export function lineAmountCents(qty: number, unitCents: number): number {
  if (!Number.isInteger(qty) || qty < 0) throw new DeskError("Quantity must be a whole number.");
  assertNonNegativeCents(unitCents, "Unit price");
  const amount = BigInt(qty) * BigInt(unitCents);
  const asNumber = Number(amount);
  if (!Number.isSafeInteger(asNumber)) throw new DeskError("That line total is too large.");
  return asNumber;
}

/**
 * Turn a typed dollar string into cents without floating point.
 * Accepts "12", "12.5", and "12.50".
 */
export function dollarsToCents(input: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new DeskError("Enter dollars and cents, like 12.50.");
  const sign = match[1] === "-" ? -1 : 1;
  const dollars = BigInt(match[2]);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const cents = dollars * 100n + BigInt(fraction || "0");
  const asNumber = Number(cents);
  if (!Number.isSafeInteger(asNumber)) throw new DeskError("That amount is too large.");
  return sign * asNumber;
}

export function formatCents(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder.toString().padStart(2, "0")}`;
}

/** Markup in basis points. 500 = 5%. Returns the billed amount, including cost. */
export function applyMarkupBps(costCents: number, bps: number): number {
  assertNonNegativeCents(costCents, "Label cost");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new DeskError("Markup must be between 0 and 100 percent.");
  }
  const extra = divRoundHalfUp(BigInt(costCents) * BigInt(bps), 10000n);
  return costCents + Number(extra);
}

/**
 * Storage for a box, in cents.
 * Rate is cents per cubic foot per 30 days.
 * Cubic feet use the exact 304.8 mm foot: mm³ × 1000 / 28,316,846,592.
 */
export function storageChargeCents(input: {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  qty: number;
  days: number;
  centsPerCuFtMonth: number;
}): number {
  const { lengthMm, widthMm, heightMm, qty, days, centsPerCuFtMonth } = input;
  for (const [label, value] of [
    ["Length", lengthMm],
    ["Width", widthMm],
    ["Height", heightMm],
    ["Quantity", qty],
    ["Days", days],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new DeskError(`${label} must be zero or more.`);
  }
  assertNonNegativeCents(centsPerCuFtMonth, "Storage rate");
  if (qty === 0 || days === 0 || centsPerCuFtMonth === 0) return 0;
  if (lengthMm === 0 || widthMm === 0 || heightMm === 0) return 0;
  const volume = BigInt(lengthMm) * BigInt(widthMm) * BigInt(heightMm);
  const numerator = volume * 1000n * BigInt(qty) * BigInt(days) * BigInt(centsPerCuFtMonth);
  const denominator = CU_FT_DENOMINATOR * DAYS_IN_RATE;
  return Number(divRoundHalfUp(numerator, denominator));
}
