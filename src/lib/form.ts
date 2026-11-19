import { DeskError } from "@/lib/errors";
import { dollarsToCents } from "@/lib/money";

export function withNotice(path: string, notice: string): string {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}notice=${encodeURIComponent(notice)}`;
}

export function safePath(value: string, fallback: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (!/^\/[A-Za-z0-9/?=&_.%-]*$/.test(value)) return fallback;
  return value;
}

export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function requireField(form: FormData, name: string, label: string): string {
  const value = field(form, name);
  if (!value) throw new DeskError(`${label} is required.`);
  return value;
}

export function intField(form: FormData, name: string, label: string, fallback?: number): number {
  const raw = field(form, name);
  if (!raw && fallback !== undefined) return fallback;
  if (!/^-?\d+$/.test(raw)) throw new DeskError(`${label} must be a whole number.`);
  return Number(raw);
}

export function moneyField(form: FormData, name: string, label: string): number {
  const raw = field(form, name);
  if (!raw) throw new DeskError(`${label} is required.`);
  try {
    return dollarsToCents(raw);
  } catch {
    throw new DeskError(`${label} should look like 12.50.`);
  }
}

export async function csvTextFromForm(form: FormData): Promise<string> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) throw new DeskError("That file is larger than 1 MB. Split it and try again.");
    return file.text();
  }
  const pasted = field(form, "csv");
  if (!pasted) throw new DeskError("Choose a CSV file or paste the rows.");
  if (pasted.length > 1_000_000) throw new DeskError("That paste is larger than 1 MB.");
  return pasted;
}
