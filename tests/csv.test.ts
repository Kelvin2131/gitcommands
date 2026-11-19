import { describe, expect, it } from "vitest";
import { csvSafe, groupOrderRows, parseOrderCsv, parseProductCsv, parseStockCsv } from "@/lib/csv";
import { isPublicHttpUrl } from "@/lib/photos";

describe("csv", () => {
  it("names the row and the missing column", () => {
    const parsed = parseProductCsv("client_code,sku,name\nNORTH,,Mug\n,MUG,Mug");
    expect(parsed.errors.map((error) => error.message).join(" ")).toMatch(/sku is required/);
    expect(parsed.errors.some((error) => error.row === 1)).toBe(true);
    expect(parsed.rows).toHaveLength(0);
  });

  it("rejects a bad stock mode and groups order lines", () => {
    const stock = parseStockCsv("client_code,sku,location,qty,mode\nNORTH,MUG,A-01,two,add");
    expect(stock.errors[0]?.message).toMatch(/whole number/);
    const orders = parseOrderCsv(
      "client_code,external_ref,channel,sku,qty\nNORTH,TM-1,TEMU,MUG,2\nNORTH,TM-1,TEMU,TOWEL,1\nNORTH,TM-1,WALMART,LAMP,1",
    );
    const grouped = groupOrderRows(orders.rows);
    expect(grouped.orders).toHaveLength(1);
    expect(grouped.orders[0]?.lines).toHaveLength(3);
    expect(grouped.errors[0]?.message).toMatch(/channels/);
  });

  it("stops spreadsheet formulas", () => {
    expect(csvSafe("=1+1")).toBe("'=1+1");
    expect(csvSafe("NORTH")).toBe("NORTH");
  });

  it("refuses private photo hosts", () => {
    expect(isPublicHttpUrl("https://cdn.example.com/mug.jpg")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1/mug.jpg")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.5/mug.jpg")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
  });
});
