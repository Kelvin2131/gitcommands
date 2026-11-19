-- Box count for the per-box ship fee.
-- Existing orders become 1 box, so a stored pack fee of 200 cents still bills $2.00.
-- Client.packFeeCents is not rewritten. Those values stay the per-box rate (prod clients are 200).
-- Cancelled orders drop any captured pick, box, and label fees so they cannot be invoiced.

ALTER TABLE "Order" ADD COLUMN "boxCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN "trackingNumbers" TEXT NOT NULL DEFAULT '';

UPDATE "Order"
SET "trackingNumbers" = "trackingNumber"
WHERE "trackingNumber" <> ''
  AND "trackingNumbers" = '';

UPDATE "Order"
SET
  "pickFeeCents" = 0,
  "packFeeCents" = 0,
  "labelCostCents" = 0,
  "labelBilledCents" = 0,
  "boxCount" = 1
WHERE "status" = 'CANCELLED'
  AND (
    "pickFeeCents" <> 0
    OR "packFeeCents" <> 0
    OR "labelCostCents" <> 0
    OR "labelBilledCents" <> 0
    OR "boxCount" <> 1
  );
