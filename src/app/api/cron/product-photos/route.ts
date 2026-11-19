import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/auth-policy";
import { toUserError } from "@/lib/errors";
import { refreshProductPhotos } from "@/lib/photo-job";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET);
  } catch (error) {
    return NextResponse.json({ error: toUserError(error) }, { status: 401 });
  }
  const result = await refreshProductPhotos();
  return NextResponse.json(result);
}
