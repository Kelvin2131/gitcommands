import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";
import { requireOwnerPage } from "@/lib/session";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireOwnerPage();
  return (
    <>
      <PageHeader
        title="New client"
        detail="The box fee is per box shipped. Fees are copied onto an order when you pack it, so later price changes do not rewrite old work."
      />
      <ClientForm />
    </>
  );
}
