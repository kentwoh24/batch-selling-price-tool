import { cookies } from "next/headers";
import { COOKIE, SESSION_SECONDS, checkLogin, makeSession } from "@/lib/auth";

export async function POST(request: Request) {
  let user = "";
  let password = "";
  try {
    const body = await request.json();
    user = String(body.username ?? "").trim();
    password = String(body.password ?? "");
  } catch {
    // fall through to the failed login below
  }

  if (!checkLogin(user, password)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return Response.json({ ok: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, makeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return Response.json({ ok: true });
}
