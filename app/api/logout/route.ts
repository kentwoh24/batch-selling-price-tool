import { cookies } from "next/headers";
import { COOKIE } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
  return Response.json({ ok: true });
}
