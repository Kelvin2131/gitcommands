import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { listClients } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const user = await requireUser();
  const clients = await listClients();
  return (
    <>
      <PageHeader title="New product" detail="The SKU stays on this client. Stock you receive later cannot jump to someone else." />
      <ProductForm user={user} clients={clients} />
    </>
  );
}
