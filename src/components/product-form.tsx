import { DeskForm } from "@/components/desk-form";
import { Field, SelectField } from "@/components/ui";
import { centsToInput } from "@/lib/format";
import type { SessionUser } from "@/lib/session";
import { saveProductAction } from "@/server/catalog-actions";

type ClientOption = { id: string; code: string; name: string };
type ProductFields = {
  id: string;
  clientId: string;
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
  active: boolean;
};

export function ProductForm({
  user,
  clients,
  product,
}: {
  user: SessionUser;
  clients: ClientOption[];
  product?: ProductFields;
}) {
  return (
    <DeskForm action={saveProductAction} submit={product ? "Save product" : "Add product"} className="card grid gap-3">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <SelectField label="Client" name="clientId" required defaultValue={product?.clientId}>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.code} · {client.name}
          </option>
        ))}
      </SelectField>
      <Field label="SKU" name="sku" required defaultValue={product?.sku} />
      <Field label="Name" name="name" required defaultValue={product?.name} />
      <Field label="Barcode" name="barcode" defaultValue={product?.barcode} className="font-mono" />
      <Field label="Photo link" name="photoUrl" defaultValue={product?.photoUrl} hint="A public https link, or a path like /samples/mug.svg" />
      <Field label="Notes" name="description" defaultValue={product?.description} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Length mm" name="lengthMm" type="number" defaultValue={product?.lengthMm ?? 0} />
        <Field label="Width mm" name="widthMm" type="number" defaultValue={product?.widthMm ?? 0} />
        <Field label="Height mm" name="heightMm" type="number" defaultValue={product?.heightMm ?? 0} />
        <Field label="Weight g" name="weightGrams" type="number" defaultValue={product?.weightGrams ?? 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reorder point" name="reorderPoint" type="number" defaultValue={product?.reorderPoint ?? 0} />
        <Field label="Reorder quantity" name="reorderQty" type="number" defaultValue={product?.reorderQty ?? 0} />
      </div>
      {user.role === "OWNER" ? (
        <Field label="Cost you paid" name="cost" defaultValue={centsToInput(product?.costCents ?? 0)} hint="Used for stock value. Dollars, like 3.50." />
      ) : null}
      <SelectField label="Active" name="active" defaultValue={product && !product.active ? "0" : "1"}>
        <option value="1">Yes</option>
        <option value="0">No</option>
      </SelectField>
    </DeskForm>
  );
}
