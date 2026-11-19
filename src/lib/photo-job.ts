import { db } from "@/lib/db";
import { isPublicHttpUrl } from "@/lib/photos";

async function urlLooksReachable(url: string): Promise<boolean> {
  if (!isPublicHttpUrl(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      await response.body?.cancel();
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    const ok = response.ok;
    await response.body?.cancel();
    return ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Check a small batch of photo links. Safe to run again; it only updates the check time. */
export async function refreshProductPhotos(limit = 25) {
  const products = await db.product.findMany({
    where: { active: true, photoUrl: { startsWith: "http" } },
    orderBy: { photoCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, photoUrl: true },
  });
  let ok = 0;
  let bad = 0;
  for (const product of products) {
    const good = await urlLooksReachable(product.photoUrl);
    await db.product.update({
      where: { id: product.id },
      data: { photoOk: good, photoCheckedAt: new Date() },
    });
    if (good) ok += 1;
    else bad += 1;
  }
  return { checked: products.length, ok, bad };
}
