import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE = "bsp_session";
export const SESSION_SECONDS = 60 * 60 * 12; // stay logged in for 12 hours

function secret() {
  return process.env.SESSION_SECRET ?? "";
}

function sig(user: string) {
  return createHmac("sha256", secret()).update(user).digest("hex");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Username and password come from .env.local (BSP_USER / BSP_PASSWORD), not from the code.
export function checkLogin(user: string, password: string) {
  const u = process.env.BSP_USER ?? "";
  const p = process.env.BSP_PASSWORD ?? "";
  if (!u || !p || !secret()) return false;
  return same(user, u) && same(password, p);
}

export function makeSession(user: string) {
  return `${user}.${sig(user)}`;
}

export function isValidSession(value: string | undefined) {
  if (!value || !secret()) return false;
  const i = value.lastIndexOf(".");
  if (i < 1) return false;
  const user = value.slice(0, i);
  return same(value.slice(i + 1), sig(user)) && user === (process.env.BSP_USER ?? "");
}
