import { DeskForm } from "@/components/desk-form";
import { PageHeader } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/session";
import { importOrdersAction, importProductsAction, importStockAction } from "@/server/import-actions";

export const metadata = { title: "Import" };

function Block({
  title,
  detail,
  action,
  sample,
  headers,
}: {
  title: string;
  detail: string;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  sample: string;
  headers: string;
}) {
  return (
    <section className="card grid gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-stone-700">{detail}</p>
      <p className="font-mono text-xs text-stone-600">{headers}</p>
      <DeskForm action={action} submit="Import" className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">CSV file</span>
          <input name="file" type="file" accept=".csv,text/csv" className="text-base" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Or paste rows</span>
          <textarea name="csv" rows={5} className="input font-mono text-sm" placeholder={headers} />
        </label>
      </DeskForm>
      <a className="text-sm font-semibold text-accent" href={sample}>
        Download a sample
      </a>
    </section>
  );
}

export default async function ImportPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="Import"
        detail="Row 1 in an error is the first row under the header. A bad row is skipped. The other rows still save. You can also download what is already in the desk."
      />
      <div className="flex flex-wrap gap-3">
        {/* File downloads, not app pages. */}
        {/* eslint-disable @next/next/no-html-link-for-pages */}
        <a className="btn-ghost" href="/api/export/products">
          Export products
        </a>
        <a className="btn-ghost" href="/api/export/stock">
          Export stock
        </a>
        <a className="btn-ghost" href="/api/export/orders">
          Export orders
        </a>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </div>
      <Block
        title="Products"
        detail={user.role === "OWNER" ? "Creates or updates SKUs. Cost is in cents, not dollars." : "Creates or updates SKUs. Cost is left for the owner."}
        action={importProductsAction}
        sample="/samples/products.csv"
        headers="client_code,sku,name,barcode,length_mm,width_mm,height_mm,weight_g,cost_cents,reorder_point,reorder_qty"
      />
      <Block
        title="Stock"
        detail='mode "set" replaces the bin count. mode "add" receives more. This is the opening-stock import. It does not run on deploy.'
        action={importStockAction}
        sample="/samples/stock.csv"
        headers="client_code,sku,location,qty,mode"
      />
      <Block
        title="Orders"
        detail="Rows that share a client and order number become one order. Dates look like 2026-11-19."
        action={importOrdersAction}
        sample="/samples/orders.csv"
        headers="client_code,external_ref,channel,customer_name,ship_city,ship_by,sku,qty"
      />
    </>
  );
}
