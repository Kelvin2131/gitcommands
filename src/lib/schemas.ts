import { z } from "zod";

export const teamMemberSchema = z.object({
  name: z.string().trim().min(2, { error: "Enter the person's name." }).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a real email." })),
  password: z.string().min(10, { error: "Use at least 10 characters." }).max(200),
});

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
