import Papa from "papaparse";
import { DeskError } from "@/lib/errors";

export type CsvIssue = { row: number; message: string };

export type ProductCsvRow = {
  row: number;
  clientCode: string;
  sku: string;
  name: string;
  barcode: string;
  description: string;
  photoUrl: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGrams: number;
  costCents: number;
  reorderPoint: number;
  reorderQty: number;
};

export type StockCsvRow = {
  row: number;
  clientCode: string;
  sku: string;
  location: string;
  qty: number;
  mode: "set" | "add";
};

export type OrderCsvRow = {
  row: number;
  clientCode: string;
  externalRef: string;
  channel: "TEMU" | "WALMART" | "OTHER";
  customerName: string;
  shipLine1: string;
  shipCity: string;
  shipRegion: string;
  shipPostal: string;
  shipCountry: string;
  shipBy: string;
  sku: string;
  qty: number;
};

export const PRODUCT_HEADERS = [
  "client_code",
  "sku",
  "name",
  "barcode",
  "description",
  "photo_url",
  "length_mm",
  "width_mm",
  "height_mm",
  "weight_g",
  "cost_cents",
  "reorder_point",
  "reorder_qty",
] as const;

export const STOCK_HEADERS = ["client_code", "sku", "location", "qty", "mode"] as const;

export const ORDER_HEADERS = [
  "client_code",
  "external_ref",
  "channel",
  "customer_name",
  "ship_line1",
  "ship_city",
  "ship_region",
  "ship_postal",
  "ship_country",
  "ship_by",
  "sku",
  "qty",
] as const;

export function csvSafe(value: string | number): string {
  const text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

export function toCsv(headers: readonly string[], rows: (string | number)[][]): string {
  return Papa.unparse({
    fields: [...headers],
    data: rows.map((row) => row.map((cell) => csvSafe(cell))),
  });
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseTable(text: string, required: readonly string[]): { rows: Record<string, string>[]; errors: CsvIssue[] } {
  const trimmed = stripBom(text).trim();
  if (!trimmed) return { rows: [], errors: [{ row: 1, message: "The file is empty." }] };
  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return { rows: [], errors: [{ row: 1, message: `Missing column ${missing.join(", ")}.` }] };
  }
  const errors: CsvIssue[] = parsed.errors
    .filter((error) => error.code !== "UndetectableDelimiter")
    .map((error) => ({
      row: (error.row ?? 0) + 2,
      message: error.message,
    }));
  return { rows: parsed.data, errors };
}

function wholeNumber(raw: string | undefined, label: string, row: number, errors: CsvIssue[], fallback = 0): number {
  const text = (raw ?? "").trim();
  if (!text) return fallback;
  if (!/^\d+$/.test(text)) {
    errors.push({ row, message: `${label} must be a whole number, not "${text}".` });
    return fallback;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > 1_000_000) {
    errors.push({ row, message: `${label} is too large.` });
    return fallback;
  }
  return value;
}

function requiredText(raw: string | undefined, label: string, row: number, errors: CsvIssue[], max = 120): string {
  const text = (raw ?? "").trim();
  if (!text) {
    errors.push({ row, message: `${label} is required.` });
    return "";
  }
  if (text.length > max) {
    errors.push({ row, message: `${label} is too long.` });
    return text.slice(0, max);
  }
  return text;
}

export function parseProductCsv(text: string): { rows: ProductCsvRow[]; errors: CsvIssue[] } {
  const table = parseTable(text, ["client_code", "sku", "name"]);
  const rows: ProductCsvRow[] = [];
  table.rows.forEach((record, index) => {
    const row = index + 1;
    const before = table.errors.length;
    const clientCode = requiredText(record.client_code, "client_code", row, table.errors, 12).toUpperCase();
    const sku = requiredText(record.sku, "sku", row, table.errors, 40);
    const name = requiredText(record.name, "name", row, table.errors, 120);
    if (table.errors.length !== before) return;
    rows.push({
      row,
      clientCode,
      sku,
      name,
      barcode: (record.barcode ?? "").trim().slice(0, 64),
      description: (record.description ?? "").trim().slice(0, 500),
      photoUrl: (record.photo_url ?? "").trim().slice(0, 500),
      lengthMm: wholeNumber(record.length_mm, "length_mm", row, table.errors),
      widthMm: wholeNumber(record.width_mm, "width_mm", row, table.errors),
      heightMm: wholeNumber(record.height_mm, "height_mm", row, table.errors),
      weightGrams: wholeNumber(record.weight_g, "weight_g", row, table.errors),
      costCents: wholeNumber(record.cost_cents, "cost_cents", row, table.errors),
      reorderPoint: wholeNumber(record.reorder_point, "reorder_point", row, table.errors),
      reorderQty: wholeNumber(record.reorder_qty, "reorder_qty", row, table.errors),
    });
  });
  return { rows, errors: table.errors };
}

export function parseStockCsv(text: string): { rows: StockCsvRow[]; errors: CsvIssue[] } {
  const table = parseTable(text, ["client_code", "sku", "location", "qty", "mode"]);
  const rows: StockCsvRow[] = [];
  table.rows.forEach((record, index) => {
    const row = index + 1;
    const clientCode = requiredText(record.client_code, "client_code", row, table.errors, 12).toUpperCase();
    const sku = requiredText(record.sku, "sku", row, table.errors, 40);
    const location = requiredText(record.location, "location", row, table.errors, 40).toUpperCase();
    const modeText = (record.mode ?? "").trim().toLowerCase();
    if (modeText !== "set" && modeText !== "add") {
      table.errors.push({ row, message: 'mode must be "set" or "add".' });
      return;
    }
    const qty = wholeNumber(record.qty, "qty", row, table.errors, -1);
    if (qty < 0) return;
    if (!clientCode || !sku || !location) return;
    rows.push({ row, clientCode, sku, location, qty, mode: modeText });
  });
  return { rows, errors: table.errors };
}

export function parseOrderCsv(text: string): { rows: OrderCsvRow[]; errors: CsvIssue[] } {
  const table = parseTable(text, ["client_code", "external_ref", "sku", "qty"]);
  const rows: OrderCsvRow[] = [];
  table.rows.forEach((record, index) => {
    const row = index + 1;
    const clientCode = requiredText(record.client_code, "client_code", row, table.errors, 12).toUpperCase();
    const externalRef = requiredText(record.external_ref, "external_ref", row, table.errors, 40);
    const sku = requiredText(record.sku, "sku", row, table.errors, 40);
    const qty = wholeNumber(record.qty, "qty", row, table.errors, 0);
    if (qty <= 0) table.errors.push({ row, message: "qty must be at least 1." });
    const channelText = (record.channel ?? "OTHER").trim().toUpperCase();
    const channel = channelText === "TEMU" || channelText === "WALMART" || channelText === "OTHER" ? channelText : "";
    if (!channel) table.errors.push({ row, message: "channel must be TEMU, WALMART, or OTHER." });
    const shipBy = (record.ship_by ?? "").trim();
    if (shipBy && !/^\d{4}-\d{2}-\d{2}$/.test(shipBy)) {
      table.errors.push({ row, message: "ship_by must look like 2026-11-19." });
    }
    if (!clientCode || !externalRef || !sku || qty <= 0 || !channel) return;
    rows.push({
      row,
      clientCode,
      externalRef,
      channel,
      customerName: (record.customer_name ?? "").trim().slice(0, 120),
      shipLine1: (record.ship_line1 ?? "").trim().slice(0, 160),
      shipCity: (record.ship_city ?? "").trim().slice(0, 80),
      shipRegion: (record.ship_region ?? "").trim().slice(0, 40),
      shipPostal: (record.ship_postal ?? "").trim().slice(0, 20),
      shipCountry: ((record.ship_country ?? "US").trim() || "US").slice(0, 2).toUpperCase(),
      shipBy,
      sku,
      qty,
    });
  });
  return { rows, errors: table.errors };
}

export type GroupedOrder = {
  row: number;
  clientCode: string;
  externalRef: string;
  channel: OrderCsvRow["channel"];
  customerName: string;
  shipLine1: string;
  shipCity: string;
  shipRegion: string;
  shipPostal: string;
  shipCountry: string;
  shipBy: string;
  lines: { row: number; sku: string; qty: number }[];
};

export function groupOrderRows(rows: OrderCsvRow[]): { orders: GroupedOrder[]; errors: CsvIssue[] } {
  const errors: CsvIssue[] = [];
  const orders = new Map<string, GroupedOrder>();
  for (const row of rows) {
    const key = `${row.clientCode}::${row.externalRef}`;
    const existing = orders.get(key);
    if (!existing) {
      orders.set(key, {
        row: row.row,
        clientCode: row.clientCode,
        externalRef: row.externalRef,
        channel: row.channel,
        customerName: row.customerName,
        shipLine1: row.shipLine1,
        shipCity: row.shipCity,
        shipRegion: row.shipRegion,
        shipPostal: row.shipPostal,
        shipCountry: row.shipCountry,
        shipBy: row.shipBy,
        lines: [{ row: row.row, sku: row.sku, qty: row.qty }],
      });
      continue;
    }
    if (existing.channel !== row.channel) {
      errors.push({ row: row.row, message: `${row.externalRef} mixes two sales channels.` });
    }
    const line = existing.lines.find((item) => item.sku === row.sku);
    if (line) line.qty += row.qty;
    else existing.lines.push({ row: row.row, sku: row.sku, qty: row.qty });
  }
  return { orders: [...orders.values()], errors };
}

export function readImportText(fileText: string): string {
  if (fileText.length > 1_000_000) throw new DeskError("That file is larger than 1 MB. Split it and try again.");
  return fileText;
}
