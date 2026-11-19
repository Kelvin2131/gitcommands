import { describe, expect, it } from "vitest";
import { calendarDaysInclusive, periodBounds, zonedTimeToUtc } from "@/lib/dates";

describe("warehouse dates", () => {
  it("knows midnight in New York", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 0, 0, "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 0, 0, "America/New_York").toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("counts calendar days, including a leap day", () => {
    expect(calendarDaysInclusive("2026-11-01", "2026-11-30")).toBe(30);
    expect(calendarDaysInclusive("2024-02-01", "2024-02-29")).toBe(29);
    const period = periodBounds("2026-11-01", "2026-11-30", "America/New_York");
    expect(period.days).toBe(30);
    expect(period.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});
