import { DeskForm } from "@/components/desk-form";
import { Field, SelectField } from "@/components/ui";
import { centsToInput } from "@/lib/format";
import { saveClientAction } from "@/server/catalog-actions";

type ClientFields = {
  id?: string;
  name: string;
  code: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  pickFeeCents: number;
  packFeeCents: number;
  storageCentsPerCuFtMonth: number;
  labelMarkupBps: number;
  active: boolean;
};

export function ClientForm({ client }: { client?: ClientFields }) {
  return (
    <DeskForm action={saveClientAction} submit={client ? "Save client" : "Add client"} className="card grid gap-3">
      {client?.id ? <input type="hidden" name="id" value={client.id} /> : null}
      <Field label="Name" name="name" required defaultValue={client?.name} />
      <Field label="Code" name="code" required defaultValue={client?.code} hint="Short code used in spreadsheets, like NORTH." />
      <Field label="Contact" name="contactName" defaultValue={client?.contactName} />
      <Field label="Email" name="email" type="email" defaultValue={client?.email} />
      <Field label="Phone" name="phone" defaultValue={client?.phone} />
      <Field label="Pick fee per unit" name="pickFee" defaultValue={centsToInput(client?.pickFeeCents ?? 0)} required />
      <Field label="Pack fee per order" name="packFee" defaultValue={centsToInput(client?.packFeeCents ?? 0)} required />
      <Field
        label="Storage per cubic foot per 30 days"
        name="storageFee"
        defaultValue={centsToInput(client?.storageCentsPerCuFtMonth ?? 0)}
        required
      />
      <Field
        label="Label markup percent"
        name="markup"
        defaultValue={centsToInput(client?.labelMarkupBps ?? 0)}
        hint="5 means you bill 5% over what you paid. 0 bills the label at cost."
      />
      <Field label="Notes" name="notes" defaultValue={client?.notes} />
      <SelectField label="Active" name="active" defaultValue={client && !client.active ? "0" : "1"}>
        <option value="1">Yes</option>
        <option value="0">Paused</option>
      </SelectField>
    </DeskForm>
  );
}
